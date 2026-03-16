// --- Dependency tracking ---

let activeEffect: (() => void) | null = null;
const effectStack: ((() => void) | null)[] = [];

let activeDeps: Set<Signal<any>> | null = null;
const depsStack: (Set<Signal<any>> | null)[] = [];

// --- Error boundary support ---

let activeErrorHandler: ((err: unknown) => void) | null = null;
const errorHandlerStack: (((err: unknown) => void) | null)[] = [];

/**
 * @internal — Register an error boundary handler. All `effect()` calls made
 * synchronously while this handler is active will capture it. When those
 * effects re-run and throw, the captured handler is invoked.
 */
export function _pushErrorHandler(h: (err: unknown) => void): void {
    errorHandlerStack.push(activeErrorHandler);
    activeErrorHandler = h;
}

/** @internal — Restore the previous error boundary handler. */
export function _popErrorHandler(): void {
    activeErrorHandler = errorHandlerStack.pop() ?? null;
}

// --- Batching ---

let batchLevel = 0;
const pendingEffects = new Set<() => void>();

// --- Effect recursion guard ---

const MAX_EFFECT_DEPTH = 100;
let effectDepth = 0;

// --- Signal ---

export class Signal<T> {
    private _value: T;
    private _subs = new Set<() => void>();

    constructor(initialValue: T) {
        this._value = initialValue;
    }

    /** Read the current value. Subscribes the active effect if one exists. */
    get value(): T {
        if (activeEffect) {
            this._subs.add(activeEffect);
            activeDeps?.add(this);
        }
        return this._value;
    }

    /** Write a new value. Notifies subscribers when the value changes. */
    set value(newValue: T) {
        if (Object.is(this._value, newValue)) return;
        this._value = newValue;
        this._notify();
    }

    /** Mutate the value via a updater function. */
    update(fn: (current: T) => T): void {
        this.value = fn(this._value);
    }

    /** Read without subscribing the active effect. */
    peek(): T {
        return this._value;
    }

    /** @internal */
    _removeSub(sub: () => void): void {
        this._subs.delete(sub);
    }

    private _notify(): void {
        if (batchLevel > 0) {
            for (const s of this._subs) pendingEffects.add(s);
        } else {
            // Evitamos la sintaxis spread [...] que aloca memoria lenta en V8
            const subs = Array.from(this._subs);
            for (let i = 0; i < subs.length; i++) {
                subs[i]();
            }
        }
    }

    dispose(): void {
        this._subs.clear();
    }
}

// --- Factories ---

export function signal<T>(initialValue: T): Signal<T> {
    return new Signal(initialValue);
}

/**
 * Runs `fn` and re-runs it whenever any signal read inside changes.
 * Returns a dispose function to tear down the effect.
 * If `fn` returns a function, it is called as cleanup before each re-run
 * and on disposal.
 */
export function effect(fn: () => void | (() => void)): () => void {
    let disposed = false;
    let cleanup: (() => void) | void;
    
    // Opt: Double buffering para evitar crear `new Set()` en cada ejecución
    let deps = new Set<Signal<any>>();
    let newDeps = new Set<Signal<any>>();
    
    const capturedErrorHandler = activeErrorHandler;

    const execute = () => {
        if (disposed) return;
        if (typeof cleanup === "function") cleanup();

        // Intercambiamos los buffers. 'deps' ahora tiene los viejos, 'newDeps' está limpio para recolectar.
        const temp = deps;
        deps = newDeps;
        newDeps = temp;
        newDeps.clear();

        effectStack.push(activeEffect);
        depsStack.push(activeDeps);
        activeEffect = execute;
        activeDeps = newDeps; // activeDeps ahora apunta al buffer limpio

        effectDepth++;
        if (effectDepth > MAX_EFFECT_DEPTH) {
            effectDepth = 0;
            activeEffect = effectStack.pop() || null;
            activeDeps = depsStack.pop() || null;
            throw new Error(
                "[Nix] Maximum effect re-execution depth exceeded (possible infinite loop)."
            );
        }

        try {
            cleanup = fn();
        } catch (err) {
            if (capturedErrorHandler) {
                capturedErrorHandler(err);
            } else {
                throw err;
            }
        } finally {
            effectDepth--;
            activeEffect = effectStack.pop() || null;
            activeDeps = depsStack.pop() || null;
            
            // Cleanup phase: Desuscribirse de señales que estaban en 'deps' pero NO en 'newDeps'
            for (const oldDep of deps) {
                if (!newDeps.has(oldDep)) {
                    oldDep._removeSub(execute);
                }
            }
        }
    };

    execute();

    return () => {
        disposed = true;
        if (typeof cleanup === "function") cleanup();
        // Al desechar, usamos newDeps porque es el que quedó activo después del último execute
        for (const dep of newDeps) {
            dep._removeSub(execute);
        }
        newDeps.clear();
        deps.clear();
    };
}

/** Derived signal that recalculates when its dependencies change. */
export function computed<T>(fn: () => T): Signal<T> & { dispose(): void } {
    const s = new Signal<T>(undefined as T);
    const disposeEffect = effect(() => { s.value = fn(); });
    const originalDispose = s.dispose;
    
    s.dispose = () => {
        disposeEffect();
        originalDispose.call(s); // Opt: Evitar el uso lento de .bind()
    };
    return s as Signal<T> & { dispose(): void };
}

/** Groups multiple signal writes so effects flush once at the end. */
export function batch(fn: () => void): void {
    batchLevel++;
    try {
        fn();
    } finally {
        batchLevel--;
        if (batchLevel === 0 && pendingEffects.size > 0) {
            // Iteración O(N) directa sin crear Arrays temporales [...pendingEffects]
            for (const effectRun of pendingEffects) {
                effectRun();
            }
            pendingEffects.clear();
        }
    }
}

/** Executes `fn` without subscribing to any signals read inside it. */
export function untrack<T>(fn: () => T): T {
    const prevEffect = activeEffect;
    const prevDeps = activeDeps;
    activeEffect = null;
    activeDeps = null;
    try {
        return fn();
    } finally {
        activeEffect = prevEffect;
        activeDeps = prevDeps;
    }
}

// --- watch ---

export interface WatchOptions {
    /** Fire the callback immediately with the current value. Default: `false`. */
    immediate?: boolean;
    /** Automatically dispose after the first callback invocation. Default: `false`. */
    once?: boolean;
}

/**
 * Watches a reactive source and calls `callback(newValue, oldValue)` on each change.
 * Accepts a Signal or a getter function. Returns a dispose function.
 */
export function watch<T>(
    source: Signal<T> | (() => T),
    callback: (newValue: T, oldValue: T | undefined) => void,
    options: WatchOptions = {}
): () => void {
    const { immediate = false, once = false } = options;

    const getter: () => T =
        source instanceof Signal ? () => source.value : source;

    let oldValue: T | undefined;
    let isFirst = true;
    let disposed = false;

    const dispose = effect(() => {
        const newValue = getter();

        if (isFirst) {
            isFirst = false;
            if (immediate && !disposed) {
                const snap = newValue;
                untrack(() => callback(snap, undefined));
                if (once) { disposed = true; Promise.resolve().then(dispose); }
            }
            oldValue = newValue;
            return;
        }

        if (!disposed) {
            const snap = newValue;
            const prev = oldValue;
            oldValue = newValue;
            untrack(() => callback(snap, prev));
            if (once) { disposed = true; Promise.resolve().then(dispose); }
        }
    });

    return () => {
        disposed = true;
        dispose();
    };
}

// --- nextTick ---

/** Returns a promise that resolves on the next microtask. Accepts an optional callback. */
export function nextTick(fn?: () => void): Promise<void> {
    return fn ? Promise.resolve().then(fn) : Promise.resolve();
}