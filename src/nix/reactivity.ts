// --- Dependency tracking ---

interface _EffectCtx {
    effect: (() => void) | null;
    deps: Set<Signal<any>> | null;
}

interface _ReactivityGlobalState {
    ctxPool: _EffectCtx[];
    ctxStack: _EffectCtx[];
    activeEffect: (() => void) | null;
    activeDeps: Set<Signal<any>> | null;
    activeErrorHandler: ((err: unknown) => void) | null;
    errorHandlerStack: (((err: unknown) => void) | null)[];
    batchLevel: number;
    pendingEffectsSet: Set<() => void>;
    pendingEffectsArr: (() => void)[];
    effectDepth: number;
    notifyBuf: ((() => void) | null)[];
    notifyBase: number;
    signalDebugHooks: _SignalDebugHooks | null;
}

function _createReactivityState(): _ReactivityGlobalState {
    return {
        ctxPool: [],
        ctxStack: [],
        activeEffect: null,
        activeDeps: null,
        activeErrorHandler: null,
        errorHandlerStack: [],
        batchLevel: 0,
        pendingEffectsSet: new Set<() => void>(),
        pendingEffectsArr: [],
        effectDepth: 0,
        notifyBuf: [],
        notifyBase: 0,
        signalDebugHooks: null,
    };
}

const _reactivityStateKey = Symbol.for("@deijose/nix-js/reactivity-state");
const _globalObj = globalThis as Record<PropertyKey, unknown>;
const _state = (() => {
    const existing = _globalObj[_reactivityStateKey] as _ReactivityGlobalState | undefined;
    if (existing) return existing;
    const created = _createReactivityState();
    _globalObj[_reactivityStateKey] = created;
    return created;
})();

// --- Error boundary support ---

/**
 * @internal — Register an error boundary handler. All `effect()` calls made
 * synchronously while this handler is active will capture it. When those
 * effects re-run and throw, the captured handler is invoked.
 */
export function _pushErrorHandler(h: (err: unknown) => void): void {
    _state.errorHandlerStack.push(_state.activeErrorHandler);
    _state.activeErrorHandler = h;
}

/** @internal — Restore the previous error boundary handler. */
export function _popErrorHandler(): void {
    _state.activeErrorHandler = _state.errorHandlerStack.pop() ?? null;
}

// --- Batching ---

// --- Effect recursion guard ---

const MAX_EFFECT_DEPTH = 100;
const _NOTIFY_SHRINK_TRIGGER = 64;
const _NOTIFY_LOW_USAGE = 16;
const _NOTIFY_SHRINK_TO = 32;

export interface _SignalDebugHooks {
    onCreate?: (signal: Signal<any>, initialValue: unknown) => void;
    onWrite?: (signal: Signal<any>, value: unknown) => void;
}

export function _setSignalDebugHooks(hooks: _SignalDebugHooks | null): void {
    _state.signalDebugHooks = hooks;
}

/** @internal — notify buffer capacity, exposed for tests. */
export function _getNotifyBufSize(): number {
    return _state.notifyBuf.length;
}

// --- Signal ---

export class Signal<T> {
    private _value: T;
    private _subs = new Set<() => void>();

    constructor(initialValue: T) {
        this._value = initialValue;
        _state.signalDebugHooks?.onCreate?.(this, initialValue);
    }

    /** Read the current value. Subscribes the active effect if one exists. */
    get value(): T {
        if (_state.activeEffect) {
            this._subs.add(_state.activeEffect);
            _state.activeDeps?.add(this);
        }
        return this._value;
    }

    /** Write a new value. Notifies subscribers when the value changes. */
    set value(newValue: T) {
        if (Object.is(this._value, newValue)) return;
        this._value = newValue;
        _state.signalDebugHooks?.onWrite?.(this, newValue);
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
        if (_state.batchLevel > 0) {
            for (const s of this._subs) {
                if (!_state.pendingEffectsSet.has(s)) {
                    _state.pendingEffectsSet.add(s);
                    _state.pendingEffectsArr.push(s);
                }
            }
            return;
        }
        const base = _state.notifyBase;
        let len = 0;
        for (const s of this._subs) _state.notifyBuf[base + len++] = s;
        _state.notifyBase = base + len;
        try {
            for (let i = 0; i < len; i++) {
                const fn = _state.notifyBuf[base + i];
                _state.notifyBuf[base + i] = null!;
                fn?.();
            }
        } finally {
            _state.notifyBase = base;
            // Shrink oversized notify buffer after a low-usage top-level flush.
            if (
                base === 0 &&
                _state.notifyBuf.length > _NOTIFY_SHRINK_TRIGGER &&
                len < _NOTIFY_LOW_USAGE
            ) {
                _state.notifyBuf.length = _NOTIFY_SHRINK_TO;
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

    const capturedErrorHandler = _state.activeErrorHandler;

    const execute = () => {
        if (disposed) return;
        if (typeof cleanup === "function") cleanup();

        // Intercambiamos los buffers. 'deps' ahora tiene los viejos, 'newDeps' está limpio para recolectar.
        const temp = deps;
        deps = newDeps;
        newDeps = temp;
        newDeps.clear();

        const ctx = _state.ctxPool.length > 0 ? _state.ctxPool.pop()! : { effect: null, deps: null };
        ctx.effect = _state.activeEffect;
        ctx.deps = _state.activeDeps;
        _state.ctxStack.push(ctx);
        _state.activeEffect = execute;
        _state.activeDeps = newDeps;

        _state.effectDepth++;
        if (_state.effectDepth > MAX_EFFECT_DEPTH) {
            _state.effectDepth = 0;
            // Restaurar desde el stack unificado
            const restored = _state.ctxStack.pop()!;
            _state.activeEffect = restored.effect;
            _state.activeDeps = restored.deps;
            restored.effect = null;
            restored.deps = null;
            _state.ctxPool.push(restored);
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
            _state.effectDepth--;
            const restored = _state.ctxStack.pop()!;
            _state.activeEffect = restored.effect;
            _state.activeDeps = restored.deps;
            restored.effect = null;   // limpiar referencias para GC
            restored.deps = null;
            _state.ctxPool.push(restored);  // devolver al pool para reutilizar


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
    let disposeEffect: (() => void) | null = null;
    let initialized = false;
    let disposed = false;

    const ensureInitialized = () => {
        if (initialized || disposed) return;
        initialized = true;
        // Important: initialize untracked so first computed evaluation does not
        // accidentally subscribe the currently running external effect.
        untrack(() => {
            disposeEffect = effect(() => {
                s.value = fn();
            });
        });
    };

    const signalProto = Object.getPrototypeOf(s) as Signal<T>;
    const valueDescriptor = Object.getOwnPropertyDescriptor(signalProto, "value");
    if (!valueDescriptor?.get || !valueDescriptor?.set) {
        throw new Error("[Nix] Internal error: Signal.value descriptor not found.");
    }

    Object.defineProperty(s, "value", {
        get() {
            ensureInitialized();
            return valueDescriptor.get!.call(this) as T;
        },
        set(v: T) {
            valueDescriptor.set!.call(this, v);
        },
        configurable: true,
    });

    const originalDispose = s.dispose;

    s.dispose = () => {
        disposed = true;
        disposeEffect?.();
        disposeEffect = null;
        originalDispose.call(s); // Opt: Evitar el uso lento de .bind()
    };
    return s as Signal<T> & { dispose(): void };
}

/** Groups multiple signal writes so effects flush once at the end. */
export function batch(fn: () => void): void {
    _state.batchLevel++;
    try {
        fn();
    } finally {
        _state.batchLevel--;
        if (_state.batchLevel === 0 && _state.pendingEffectsArr.length > 0) {
            const len = _state.pendingEffectsArr.length;
            for (let i = 0; i < len; i++) _state.pendingEffectsArr[i]();
            _state.pendingEffectsArr.length = 0;  // reset O(1) sin GC — key del cambio
            _state.pendingEffectsSet.clear();
        }
    }
}

/** Executes `fn` without subscribing to any signals read inside it. */
export function untrack<T>(fn: () => T): T {
    const prevEffect = _state.activeEffect;
    const prevDeps = _state.activeDeps;
    _state.activeEffect = null;
    _state.activeDeps = null;
    try {
        return fn();
    } finally {
        _state.activeEffect = prevEffect;
        _state.activeDeps = prevDeps;
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