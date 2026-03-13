import { Signal, signal} from "./reactivity";

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
    /** The current state snapshot. Reactive. */
    readonly $state: T;
    /** Resets all signals to their initial values. */
    $reset(): void;
    /** Patches the store with a partial state. */
    $patch(partial: Partial<T>): void;
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
    const signals = {} as Record<string, Signal<unknown>>;
    const RESERVED = new Set(["$reset", "$patch", "$state"]);

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

    const store = Object.assign(
        Object.create(null) as object,
        typedSignals,
        {
            $reset,
            $patch,
        },
    ) as Store<T, A>;

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

    return store;
}
