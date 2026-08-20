import { watch, untrack } from "./reactivity.js";
import { type NixPlugin, type Store, type GuardFn } from "./store.js";

/**
 * Minimal interface that any storage adapter must implement.
 * Compatible with localStorage, sessionStorage, AsyncStorage, IndexedDB, etc.
 */
interface StorageAdapter {
    /** Retrieves an item from storage. Returns null if not found. */
    getItem(key: string): string | null | Promise<string | null>;
    /** Stores an item in storage. */
    setItem(key: string, value: string): void | Promise<void>;
    /** Optional: Removes an item from storage. */
    removeItem?(key: string): void | Promise<void>;
}

/**
 * Persists the store state to a storage medium (defaults to localStorage).
 * Automatically hydrates on initialization and saves changes on every reactive flush.
 */
export function persistPlugin<T extends Record<string, unknown>>(
    storageKey: string,
    opts: {
        /** Storage adapter to use. Defaults to localStorage. */
        storage?: StorageAdapter;
        /** Properties to exclude from persistence. */
        exclude?: Array<keyof T>;
        /** Custom serialization function. Defaults to JSON.stringify. */
        serialize?: (state: T) => string;
        /** Custom deserialization function. Defaults to JSON.parse. */
        deserialize?: (raw: string) => Partial<T>;
        /** Debounce interval in milliseconds for batching writes. Defaults to 0 (immediate). */
        debounce?: number;
    } = {},
): NixPlugin<T> {
    const {
        storage = localStorage,
        exclude = [],
        serialize = JSON.stringify,
        deserialize = JSON.parse,
        debounce = 0,
    } = opts;

    return (store) => {
        untrack(async () => {
            try {
                const raw = await storage.getItem(storageKey);
                if (!raw) return;
                const saved = deserialize(raw) as Partial<T>;

                const patch: Partial<T> = {};
                for (const key of Object.keys(saved)) {
                    if (key in store.$state && !exclude.includes(key as keyof T)) {
                        (patch as Record<string, unknown>)[key] = (saved as Record<string, unknown>)[key];
                    }
                }
                if (Object.keys(patch).length > 0) store.$patch(patch);
            } catch {
                // Silently fail if storage is inaccessible (e.g., SSR or Private Mode).
            }
        });

        let timeoutId: ReturnType<typeof setTimeout>;

        return watch(store.$stateSignal, (next) => {
            const persist = () => {
                try {
                    const toSave = exclude.length === 0
                        ? next
                        : Object.fromEntries(
                            Object.entries(next).filter(([k]) => !exclude.includes(k as keyof T))
                        ) as T;
                    storage.setItem(storageKey, serialize(toSave));
                } catch {
                    // Fail silently if storage quota is exceeded.
                }
            };

            if (debounce > 0) {
                clearTimeout(timeoutId);
                timeoutId = setTimeout(persist, debounce);
            } else {
                persist();
            }
        });
    };
}

/**
 * Logs state transitions to the console.
 * Calculates property-level diffs and groups output by store ID.
 */
export function loggerPlugin<T extends Record<string, unknown>>(
    opts: {
        /** Whether the console group should be collapsed by default. */
        collapsed?: boolean;
        /** Optional filter to skip logging for specific changes. */
        filter?: (diff: Partial<T>) => boolean;
    } = {},
): NixPlugin<T> {
    const { collapsed = true, filter } = opts;

    return (store) => {
        const groupFn = collapsed ? console.groupCollapsed : console.group;

        return watch(store.$stateSignal, (next, prev) => {
            if (!prev) return;

            const diff: Partial<T> = {};
            for (const key of Object.keys(next) as Array<keyof T & string>) {
                if (!Object.is(next[key], prev[key])) {
                    (diff as Record<string, unknown>)[key] = next[key];
                }
            }

            if (Object.keys(diff).length === 0) return;
            if (filter && !filter(diff)) return;

            groupFn(
                `%c[nix:${store.$id}]%c ${Object.keys(diff).join(", ")}`,
                "color:#7F77DD;font-weight:500",
                "color:inherit;font-weight:400",
            );
            console.log("prev  →", prev);
            console.log("next  →", next);
            console.log("diff  →", diff);
            console.groupEnd();
        }, { immediate: true });
    };
}

/**
 * Intercepts $patch and $reset calls to validate or transform state before it is applied.
 */
export function guardPlugin<T extends Record<string, unknown>>(
    guards: GuardFn<T>[],
): NixPlugin<T> {
    return (store) => {
        const registry = (store as unknown as { _guardFns: GuardFn<T>[] })._guardFns;
        for (const guard of guards) {
            registry.push(guard);
        }
        return () => {
            for (const guard of guards) {
                const idx = registry.indexOf(guard);
                if (idx >= 0) registry.splice(idx, 1);
            }
        };
    };
}

/**
 * Synchronizes data between two stores by watching one and patching the other.
 */
export function bridgePlugin<
    TA extends Record<string, unknown>,
    TB extends Record<string, unknown>,
>(
    sourceStore: Store<TB>,
    sync: (sourceState: TB, targetStore: Store<TA>) => void,
): NixPlugin<TA> {
    return (targetStore) => {
        return watch(sourceStore.$stateSignal, (sourceState) => {
            sync(sourceState, targetStore);
        });
    };
}