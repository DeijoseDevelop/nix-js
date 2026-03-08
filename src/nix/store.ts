import { Signal, signal } from "./reactivity";

// --- Types ---

/** Maps each state property to its corresponding Signal. */
export type StoreSignals<T extends Record<string, unknown>> = {
    readonly [K in keyof T]: Signal<T[K]>;
};

/** The store as seen by the consumer: signals + actions + `$reset`. */
export type Store<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
> = StoreSignals<T> & A & {
    /** Resets all signals to their initial values. */
    $reset(): void;
};

// --- createStore ---

/**
 * Creates a reactive global store. Each property becomes a Signal.
 * Optional `actionsFactory` receives the signals and returns action methods.
 */
export function createStore<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
>(
    initialState: T,
    actionsFactory?: (signals: StoreSignals<T>) => A
): Store<T, A> {
    // Create a Signal per property
    const signals = {} as Record<string, Signal<unknown>>;
    for (const key of Object.keys(initialState)) {
        signals[key] = signal(initialState[key]);
    }

    const typedSignals = signals as unknown as StoreSignals<T>;

    // $reset: restore each signal to initial value
    function $reset() {
        for (const key of Object.keys(initialState)) {
            (signals[key] as Signal<unknown>).value = initialState[key];
        }
    }

    // Build the store object
    const store = Object.assign(
        Object.create(null) as object,
        typedSignals,
        { $reset }
    ) as Store<T, A>;

    // Attach actions if provided
    if (actionsFactory) {
        const actions = actionsFactory(typedSignals);
        for (const key of Object.keys(actions)) {
            if (key === "$reset") {
                console.warn(`[Nix] Store action name "$reset" is reserved and will be ignored.`);
                continue;
            }
            (store as Record<string, unknown>)[key] = (actions as Record<string, unknown>)[key];
        }
    }

    return store;
}
