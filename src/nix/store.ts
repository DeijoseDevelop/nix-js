import { Signal, signal, watch } from "./reactivity";

// --- Types ---

/** Maps each state property to its corresponding Signal. */
export type StoreSignals<T extends Record<string, unknown>> = {
    readonly [K in keyof T]: Signal<T[K]>;
};

/** Subscriber callback used by `$subscribe`. */
export type StoreSubscriber<T extends Record<string, unknown>> = (
    key: keyof T,
    newValue: T[keyof T],
    oldValue: T[keyof T] | undefined,
) => void;

/** The store as seen by the consumer: signals + actions + getters + built-ins. */
export type Store<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
    G extends Record<string, Signal<unknown>> = Record<never, never>,
> = StoreSignals<T> & A & G & {
    /** The current state snapshot. Reactive. */
    readonly $state: T;
    /** Resets all signals to their initial values. */
    $reset(): void;
    /** Patches the store with a partial state. */
    $patch(partial: Partial<T>): void;
    /** Subscribes to all store signal changes. Returns an unsubscribe function. */
    $subscribe(listener: StoreSubscriber<T>): () => void;
};

// --- createStore ---

/**
 * Creates a reactive global store. Each property becomes a Signal.
 * Optional `actionsFactory` receives the signals and returns action methods.
 * Optional `gettersFactory` receives the signals and returns derived getter signals.
 */
export function createStore<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
    G extends Record<string, Signal<unknown>> = Record<never, never>,
>(
    initialState: T,
    actionsFactory?: (signals: StoreSignals<T>) => A,
    gettersFactory?: (signals: StoreSignals<T>) => G,
): Store<T, A, G> {
    const signals = {} as Record<string, Signal<unknown>>;
    const RESERVED = new Set(["$reset", "$patch", "$state", "$subscribe"]);

    for (const key of Object.keys(initialState)) {
        if (RESERVED.has(key)) {
            throw new Error(`[Nix] Store key "${key}" is reserved.`);
        }
        signals[key] = signal(initialState[key]);
    }

    const typedSignals = signals as unknown as StoreSignals<T>;

    function $reset() {
        for (const key of Object.keys(initialState)) {
            (signals[key] as Signal<unknown>).value = initialState[key];
        }
    }

    function $patch(partial: Partial<T>) {
        for (const key of Object.keys(partial)) {
            if (key in signals) {
                (signals[key] as Signal<unknown>).value = partial[key as keyof T];
            }
        }
    }

    function $subscribe(listener: StoreSubscriber<T>): () => void {
        const unsubs: Array<() => void> = [];
        for (const key of Object.keys(initialState) as Array<keyof T & string>) {
            const sig = typedSignals[key as keyof T];
            const unsub = watch(sig, (newValue, oldValue) => {
                listener(
                    key as keyof T,
                    newValue as T[keyof T],
                    oldValue as T[keyof T] | undefined,
                );
            });
            unsubs.push(unsub);
        }

        return () => {
            for (const unsub of unsubs) unsub();
        };
    }

    const store = Object.assign(
        Object.create(null) as object,
        typedSignals,
        {
            $reset,
            $patch,
            $subscribe,
        },
    ) as Store<T, A, G>;

    Object.defineProperty(store, "$state", {
        get(): T {
            const snap = {} as T;
            for (const key in signals) {
                (snap as Record<string, unknown>)[key] =
                    (signals[key] as Signal<unknown>).value;
            }
            return snap;
        },
        enumerable: true,
        configurable: false,
    });

    if (actionsFactory) {
        const actions = actionsFactory(typedSignals);
        for (const key of Object.keys(actions)) {
            if (RESERVED.has(key)) {
                console.warn(`[Nix] Store action name "${key}" is reserved and will be ignored.`);
                continue;
            }
            (store as Record<string, unknown>)[key] = (actions as Record<string, unknown>)[key];
        }
    }

    if (gettersFactory) {
        const getters = gettersFactory(typedSignals);
        for (const key of Object.keys(getters)) {
            if (RESERVED.has(key)) {
                console.warn(`[Nix] Store getter name "${key}" is reserved and will be ignored.`);
                continue;
            }
            (store as Record<string, unknown>)[key] = (getters as Record<string, unknown>)[key];
        }
    }

    return store;
}
