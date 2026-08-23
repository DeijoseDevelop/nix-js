import {
    Signal,
    signal,
    computed,
    batch,
    watch,
    type WatchOptions,
} from "./reactivity.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Maps a plain state object T into a record of Signals — one per key.
 * This is what the actions/getters factories receive as their argument.
 *
 * Given:   { count: number, name: string }
 * Becomes: { count: Signal<number>, name: Signal<string> }
 */
export type StoreSignals<T extends object> = {
    readonly [K in keyof T]: Signal<T[K]>;
};

/**
 * A read-only Signal — extends Signal so it satisfies `instanceof Signal`
 * checks (used by `watch()`), but throws on any mutation attempt.
 */
export class ReadonlySignal<T> extends Signal<T> {
    private readonly label: string;
    constructor(source: Signal<T>, label: string = "ReadonlySignal") {
        super(source.peek());
        this.label = label;

        Object.defineProperty(this, "value", {
            get: () => source.value,
            set: () => { throw new Error(`[nix-js] "${this.label}" is read-only.`); },
            configurable: false,
        });

        this.update = () => { throw new Error(`[nix-js] "${this.label}" is read-only.`); };
        this.dispose = () => { throw new Error(`[nix-js] Cannot dispose "${this.label}" directly.`); };
    }
}

/**
 * Maps a getters factory result (a record of Signals) into a record of
 * read-only Signals exposed on the store.
 *
 * The Omit pattern enforces `readonly value` at the type level — TypeScript
 * blocks `getter.value = x` at compile time. The runtime ReadonlySignal class
 * also throws on mutation as defense in depth.
 */
export type StoreGetters<G extends Record<string, Signal<unknown>>> = {
    readonly [K in keyof G]: Omit<ReadonlySignal<G[K] extends Signal<infer V> ? V : never>, "value"> & {
        readonly value: G[K] extends Signal<infer V> ? V : never;
    };
};

/**
 * The full store type — combines reactive state signals, action methods,
 * computed getters (as ReadonlySignals), and the framework-level $-prefixed API.
 */
export type Store<
    T extends object,
    A extends object = Record<never, never>,
    G extends Record<string, Signal<unknown>> = Record<never, never>,
> = StoreSignals<T> & A & StoreGetters<G> & {
    readonly $id: string;
    /** Reactive snapshot — reading inside effect/computed creates a subscription to the whole state. */
    readonly $state: T;
    /**
     * Passive snapshot — returns the current state values WITHOUT creating
     * a reactive subscription. Use this in plugins, loggers, persistence,
     * or anywhere you need a one-shot read.
     */
    $snapshot(): T;
    /**
     * The computed Signal that backs $state. Plugins receive this to
     * compose new reactive nodes on top.
     */
    readonly $stateSignal: ReadonlySignal<T>;
    /** Reset to initial values (batched). */
    $reset(): void;
    /** Partial update (batched). */
    $patch(partial: Partial<T>): void;
    /** Watches state changes. Equivalent to `watch(store.$stateSignal, cb, opts)`. */
    $watch(cb: (next: T, prev: T | undefined) => void, options?: WatchOptions): () => void;
    /** Disposes the store and runs all plugin cleanups. */
    $dispose(): void;
};

// ---------------------------------------------------------------------------
// Factory types
// ---------------------------------------------------------------------------

export type ActionsFactory<
    T extends object,
    A extends object,
> = (signals: StoreSignals<T>) => A;

export type GettersFactory<
    T extends object,
    G extends Record<string, Signal<unknown>>,
> = (signals: StoreSignals<T>) => G;

// ---------------------------------------------------------------------------
// Plugin type
// ---------------------------------------------------------------------------

/**
 * Function type for mutation guards.
 * Intercepts $patch and $reset to validate or transform state before it is applied.
 */
export type GuardFn<T extends object> = (
    next: Partial<T>,
    current: T,
) => Partial<T> | void;

/**
 * A NixPlugin is a function that receives the assembled store and
 * optionally returns a cleanup function called on $dispose().
 *
 * There are NO lifecycle hooks. Plugins extend the signal graph directly
 * using the framework primitives:
 *
 *   watch(store.$stateSignal, ...)        — react to any state change
 *   computed(() => store.someSignal.value) — derive new nodes
 *   store.$snapshot()                      — passive read for logging/persistence
 */
export type NixPlugin<
    T extends object,
    A extends object = Record<never, never>,
    G extends Record<string, Signal<unknown>> = Record<never, never>,
> = (store: Store<T, A, G>) => (() => void) | void;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/**
 * Options object for createStore. NoInfer<T> on factory parameters ensures
 * T is inferred ONLY from initialState, never from the factories — this is
 * what restores the type inference that broke in v2.2.1.
 */
export type CreateStoreOptions<
    T extends object,
    A extends object,
    G extends Record<string, Signal<unknown>>,
> = {
    /** Display name. Used in error messages, devtools, and $id. */
    name?: string;
    /** Action factory — receives raw signals, returns methods exposed on the store. */
    actions?: (signals: StoreSignals<NoInfer<T>>) => A;
    /** Getter factory — receives raw signals, returns computed Signals exposed as ReadonlySignals. */
    getters?: (signals: StoreSignals<NoInfer<T>>) => G;
    /** Plugins to extend the store. Each receives the assembled store. */
    plugins?: NixPlugin<NoInfer<T>, A, G>[];
    /**
     * Custom serializer for the store baseline (used by `$reset`).
     * Defaults to `structuredClone`. Provide this when your state contains
     * non-serializable values (Map, Set, class instances, etc.) that
     * `structuredClone` cannot handle.
     */
    serialize?: (state: NoInfer<T>) => T;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RESERVED = new Set([
    "$id", "$state", "$stateSignal", "$snapshot",
    "$reset", "$patch", "$watch", "$dispose",
]);

function assertKey(key: string): void {
    if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new Error(`[nix-js] Store key "${key}" is not allowed for security reasons.`);
    }
    if (RESERVED.has(key)) throw new Error(`[nix-js] Store key "${key}" is reserved.`);
}

function warnReserved(key: string, ctx: "action" | "getter"): boolean {
    if (!RESERVED.has(key)) return true;
    console.warn(`[nix-js] Store ${ctx} "${key}" is reserved and will be ignored.`);
    return false;
}

function makeReadonly<T>(sig: Signal<T>, label: string): ReadonlySignal<T> {
    return new ReadonlySignal(sig, label);
}

// ---------------------------------------------------------------------------
// createStore
// ---------------------------------------------------------------------------

/**
 * Creates a reactive store with optional actions, getters, and plugins.
 *
 * @example Just state
 * ```ts
 * const counter = createStore({ count: 0 });
 * counter.count.value++;
 * ```
 *
 * @example State + actions
 * ```ts
 * const counter = createStore({ count: 0 }, {
 *   actions: (s) => ({ increment: () => s.count.value++ }),
 * });
 * counter.increment();
 * ```
 *
 * @example State + getters (no actions)
 * ```ts
 * const inventory = createStore({ items: [] as Item[] }, {
 *   getters: (s) => ({ count: computed(() => s.items.value.length) }),
 * });
 * inventory.count.value;
 * ```
 *
 * @example Full store
 * ```ts
 * const cart = createStore({ items: [] as Item[], discount: 0 }, {
 *   name: "cart",
 *   actions: (s) => ({ addItem: (i: Item) => { s.items.value = [...s.items.value, i] } }),
 *   getters: (s) => ({ total: computed(() => s.items.value.reduce((sum, i) => sum + i.price, 0) * (1 - s.discount.value)) }),
 *   plugins: [persistPlugin({ key: "cart" })],
 * });
 * ```
 */
export function createStore<
    T extends object,
    A extends object = Record<never, never>,
    G extends Record<string, Signal<unknown>> = Record<never, never>,
>(
    initialState: T,
    options?: CreateStoreOptions<T, A, G>,
): Store<T, A, G> {
    const { name = "store", actions: actionsFactory, getters: gettersFactory, plugins = [], serialize } = options ?? {};

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
        // Use custom serializer if provided, otherwise structuredClone.
        _baseline = serialize ? serialize(initialState) : structuredClone(initialState);
    } catch (e) {
        throw new Error(
            `[nix-js] Store "${name}" initialState contains non-serializable data ` +
            `(functions, DOM nodes, Symbols, or WeakRefs). ` +
            `Provide a custom \`serialize\` option or remove these before creating the store. ` +
            `Original error: ${e}`
        );
    }

    const _guardFns: GuardFn<T>[] = [];

    function $reset(): void {
        const current = $snapshot();
        for (const guard of _guardFns) {
            guard(current, current);
        }
        batch(() => {
            for (const key of keys) {
                signals[key].value = _baseline[key];
            }
        });
    }

    function $patch(partial: Partial<T>): void {
        let payload: Partial<T> = partial;
        const current = $snapshot();
        for (const guard of _guardFns) {
            const result = guard(payload, current);
            if (result !== undefined) {
                payload = result;
            }
        }
        batch(() => {
            for (const key of Object.keys(payload) as Array<keyof T & string>) {
                if (Object.prototype.hasOwnProperty.call(signals, key)) {
                    signals[key].value = payload[key] as T[keyof T & string];
                }
            }
        });
    }

    function $snapshot(): T {
        // Passive read — uses peek() to avoid creating a reactive subscription.
        const snap = {} as T;
        for (const key of keys) {
            snap[key] = signals[key].peek();
        }
        return snap;
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
        { $reset, $patch, $watch, $snapshot },
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

    Object.defineProperty(store, "_guardFns", {
        value: _guardFns, writable: false, enumerable: false, configurable: false,
    });

    const occupiedKeys = new Set<string>([...keys, ...Array.from(RESERVED)]);

    if (actionsFactory) {
        const raw = actionsFactory(typedSignals);
        for (const key of Object.keys(raw)) {
            if (!warnReserved(key, "action")) continue;
            if (occupiedKeys.has(key)) {
                console.warn(
                    `[nix-js] Store "${name}": action "${key}" collides with an existing ` +
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
                    `[nix-js] Store "${name}": getter "${key}" collides with an existing ` +
                    `signal or action and will be ignored.`,
                );
                continue;
            }

            const sig = (raw as Record<string, Signal<unknown>>)[key];

            if (!(sig instanceof Signal)) {
                throw new TypeError(
                    `[nix-js] Store "${name}": getter "${key}" must return a Signal ` +
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
                `[nix-js] Plugin initialization failed for store "${name}":`,
                error
            );
        }
    }

    (store as Record<string, unknown>)["$dispose"] = () => {
        for (const fn of cleanups) fn();
    };

    return store;
}