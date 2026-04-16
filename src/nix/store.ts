import {
    Signal,
    signal,
    computed,
    batch,
    watch,
    type WatchOptions,
} from "./reactivity";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StoreSignals<T extends Record<string, unknown>> = {
    readonly [K in keyof T]: Signal<T[K]>;
};

export type ReadonlySignal<T> = Omit<Signal<T>, "value" | "update" | "dispose"> & {
    readonly value: T;
    readonly dispose: never;
};

export type StoreGetters<G extends Record<string, Signal<unknown>>> = {
    readonly [K in keyof G]: ReadonlySignal<
        G[K] extends Signal<infer V> ? V : never
    >;
};

export type Store<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
    G extends Record<string, Signal<unknown>> = Record<never, never>,
> = StoreSignals<T> &
    A &
    StoreGetters<G> & {
        readonly $id: string;
        /** Current snapshot — reading inside effect/computed creates subscription. */
        readonly $state: T;
        /**
         * The computed Signal that backs $state.
         * Plugins receive this to compose new reactive nodes on top.
         * This is what makes the plugin system reactive-native:
         * no hooks, just signals all the way down.
         */
        readonly $stateSignal: ReadonlySignal<T>;
        /** Reset to initial values (batched). */
        $reset(): void;
        /** Partial update (batched). */
        $patch(partial: Partial<T>): void;
        /**
         * Watches state changes. This is exactly watch() from reactivity.ts —
         * no new primitive to learn.
         */
        $watch(cb: (next: T, prev: T | undefined) => void, options?: WatchOptions): () => void;
        /** Disposes the store and runs all plugin cleanups. */
        $dispose(): void;
    };

// ---------------------------------------------------------------------------
// Plugin type
// ---------------------------------------------------------------------------

/**
 * A NixPlugin is a function that receives the assembled store and
 * optionally returns a cleanup function.
 *
 * There are NO lifecycle hooks. The plugin extends the signal graph directly:
 *
 *   watch(store.$stateSignal, ...)        — react to any state change
 *   computed(() => store.someSignal.value) — derive new nodes
 *   store.mySignal = signal(...)           — attach new reactive state
 *   wrapMethod(store, '$patch', ...)       — intercept mutations
 *
 * Because plugins only use Nix.js primitives, they compose with each other
 * naturally — one plugin can observe a signal that another plugin added.
 */
export type NixPlugin<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
    G extends Record<string, Signal<unknown>> = Record<never, never>,
> = (store: Store<T, A, G>) => (() => void) | void;

export interface CreateStoreOptions<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
    G extends Record<string, Signal<unknown>> = Record<never, never>,
> {
    name?: string;
    plugins?: NixPlugin<T, A, G>[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RESERVED = new Set([
    "$id", "$state", "$stateSignal",
    "$reset", "$patch", "$watch", "$dispose",
]);

function assertKey(key: string): void {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new Error(`[Nix] Store key "${key}" is not allowed for security reasons.`);
    }
    if (RESERVED.has(key)) throw new Error(`[Nix] Store key "${key}" is reserved.`);
}

function warnReserved(key: string, ctx: "action" | "getter"): boolean {
    if (!RESERVED.has(key)) return true;
    console.warn(`[Nix] Store ${ctx} "${key}" is reserved and will be ignored.`);
    return false;
}

function makeReadonly<T>(sig: Signal<T>, label: string): ReadonlySignal<T> {
    const ro = Object.create(sig) as ReadonlySignal<T>;

    Object.defineProperty(ro, "dispose", {
        value: () => {
            throw new Error(
                `[Nix] Cannot dispose readonly getter "${label}". ` +
                `Dispose the store instead with store.$dispose().`
            );
        },
        writable: false,
        configurable: false,
    });

    Object.defineProperty(ro, "value", {
        get() { return sig.value; },
        set() { throw new Error(`[Nix] "${label}" is read-only.`); },
        configurable: false,
    });

    Object.defineProperty(ro, "update", {
        value: () => {
            throw new Error(`[Nix] "${label}" is read-only.`);
        },
        writable: false,
        configurable: false,
    });

    return ro;
}

// ---------------------------------------------------------------------------
// createStore
// ---------------------------------------------------------------------------

export function createStore<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
    G extends Record<string, Signal<unknown>> = Record<never, never>,
>(
    initialState: T,
    actionsFactory?: (signals: StoreSignals<T>) => A,
    gettersFactory?: (signals: StoreSignals<T>) => G,
    options: CreateStoreOptions<T, A, G> = {},
): Store<T, A, G> {
    const { name = "store", plugins = [] } = options;

    const keys = Object.keys(initialState) as Array<keyof T & string>;

    const signals = {} as { [K in keyof T]: Signal<T[K]> };
    for (const key of keys) {
        assertKey(key);
        signals[key] = signal(initialState[key]);
    }
    const typedSignals: StoreSignals<T> = signals;

    const _stateComputed = computed<T>(() => {
        const snap = {} as T;
        for (const key of keys) {
            snap[key] = signals[key].value;
        }
        return snap;
    });

    const $stateSignal = makeReadonly(_stateComputed, `store "${name}".$stateSignal`);

    let _baseline: T;
    try {
        _baseline = structuredClone(initialState);
    } catch (e) {
        throw new Error(
            `[Nix] Store "${name}" initialState contains non-serializable data ` +
            `(functions, DOM nodes, Symbols, or WeakRefs). ` +
            `Remove these before creating the store. Original error: ${e}`
        );
    }

    function $reset(): void {
        batch(() => {
            for (const key of keys) {
                signals[key].value = _baseline[key];
            }
        });
    }

    function $patch(partial: Partial<T>): void {
        batch(() => {
            for (const key of Object.keys(partial) as Array<keyof T & string>) {
                if (Object.prototype.hasOwnProperty.call(signals, key)) {
                    signals[key].value = partial[key] as T[keyof T & string];
                }
            }
        });
    }

    function $watch(
        cb: (next: T, prev: T | undefined) => void,
        opts?: WatchOptions,
    ): () => void {
        return watch(_stateComputed, cb, opts);
    }

    const store = Object.assign(
        Object.create(null) as object,
        typedSignals,
        { $reset, $patch, $watch },
    ) as Store<T, A, G>;

    Object.defineProperty(store, "$id", {
        value: name, writable: false, enumerable: false, configurable: false,
    });

    Object.defineProperty(store, "$state", {
        get(): T { return _stateComputed.value; },
        enumerable: true, configurable: false,
    });

    Object.defineProperty(store, "$stateSignal", {
        value: $stateSignal, writable: false, enumerable: false, configurable: false,
    });

    const occupiedKeys = new Set<string>([...keys, ...Array.from(RESERVED)]);

    if (actionsFactory) {
        const raw = actionsFactory(typedSignals);
        for (const key of Object.keys(raw)) {
            if (!warnReserved(key, "action")) continue;
            if (occupiedKeys.has(key)) {
                console.warn(
                    `[Nix] Store "${name}": action "${key}" collides with an existing ` +
                    `signal or getter and will be ignored.`,
                );
                continue;
            }
            occupiedKeys.add(key);
            (store as Record<string, unknown>)[key] =
                (raw as Record<string, unknown>)[key];
        }
    }

    if (gettersFactory) {
        const raw = gettersFactory(typedSignals);
        for (const key of Object.keys(raw)) {
            if (!warnReserved(key, "getter")) continue;
            if (occupiedKeys.has(key)) {
                console.warn(
                    `[Nix] Store "${name}": getter "${key}" collides with an existing ` +
                    `signal or action and will be ignored.`,
                );
                continue;
            }

            const sig = (raw as Record<string, Signal<unknown>>)[key];

            if (!(sig instanceof Signal)) {
                throw new TypeError(
                    `[Nix] Store "${name}": getter "${key}" must return a Signal ` +
                    `(wrap it with computed()). Got: ${typeof sig}`
                );
            }

            occupiedKeys.add(key);
            (store as Record<string, unknown>)[key] =
                makeReadonly(sig, `getter "${key}" in store "${name}"`);
        }
    }

    const cleanups: Array<() => void> = [() => _stateComputed.dispose()];

    for (const plugin of plugins) {
        try {
            const cleanup = plugin(store);
            if (typeof cleanup === "function") cleanups.push(cleanup);
        } catch (error) {
            console.error(
                `[Nix] Plugin initialization failed for store "${name}":`,
                error
            );
        }
    }

    (store as Record<string, unknown>)["$dispose"] = () => {
        for (const fn of cleanups) fn();
    };

    return store;
}