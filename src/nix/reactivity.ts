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
        const subs = [...this._subs];

        if (batchLevel > 0) {
            subs.forEach((s) => pendingEffects.add(s));
        } else {
            subs.forEach((s) => s());
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
    let cleanup: (() => void) | void;
    let deps = new Set<Signal<any>>();
    const capturedErrorHandler = activeErrorHandler;

    const execute = () => {
        if (typeof cleanup === "function") cleanup();

        deps.forEach((dep) => dep._removeSub(execute));
        deps = new Set();

        effectStack.push(activeEffect);
        depsStack.push(activeDeps);
        activeEffect = execute;
        activeDeps = deps;

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
        }
    };

    execute();

    return () => {
        if (typeof cleanup === "function") cleanup();
        deps.forEach((dep) => dep._removeSub(execute));
        deps.clear();
    };
}

/** Derived signal that recalculates when its dependencies change. */
export function computed<T>(fn: () => T): Signal<T> {
    const s = new Signal<T>(undefined as T);

    effect(() => {
        s.value = fn();
    });

    return s;
}

/** Groups multiple signal writes so effects flush once at the end. */
export function batch(fn: () => void): void {
    batchLevel++;
    try {
        fn();
    } finally {
        batchLevel--;
        if (batchLevel === 0) {
            const pending = [...pendingEffects];
            pendingEffects.clear();
            pending.forEach((f) => f());
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