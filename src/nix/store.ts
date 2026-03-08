// ═══════════════════════════════════════════════
//  Nix.js ❄️ — Global Stores  (Fase 5)
// ═══════════════════════════════════════════════
//
//  createStore(initialState, actions?)
//
//  Crea un store reactivo global.  Cada propiedad del estado
//  se convierte en un Signal — legible y escribible.
//  Las acciones reciben directamente los signals del estado.
//
//  Ejemplo básico:
//
//    const counter = createStore({ count: 0 });
//    counter.count.value++;           // escribe
//    counter.count.value              // lee (reactivo en effects/templates)
//
//  Con acciones:
//
//    const counter = createStore(
//      { count: 0 },
//      (s) => ({
//        increment: ()      => s.count.update(n => n + 1),
//        add:       (n: number) => s.count.update(c => c + n),
//        reset:     ()      => counter.$reset(),
//      })
//    );
//
//    counter.increment();
//    counter.add(5);
//    counter.$reset();   // restaura todos los valores iniciales

import { Signal, signal } from "./reactivity";

// ─── Tipos ────────────────────────────────────────────────────────────────────

/** Transforma cada propiedad del estado inicial en su Signal correspondiente. */
export type StoreSignals<T extends Record<string, unknown>> = {
    readonly [K in keyof T]: Signal<T[K]>;
};

/** Tipo del store tal como lo ve el usuario. */
export type Store<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
> = StoreSignals<T> & A & {
    /**
     * Restaura todos los signals a sus valores iniciales.
     * Equivalente a hacer `signal.value = initialValue` en cada propiedad.
     */
    $reset(): void;
};

// ─── createStore ──────────────────────────────────────────────────────────────

/**
 * Crea un store reactivo global.
 *
 * @param initialState  Objeto plano con los valores iniciales.
 * @param actionsFactory  Función que recibe los signals y retorna acciones.
 *
 * @example
 *   // Sin acciones
 *   const theme = createStore({ dark: false, fontSize: 16 });
 *   theme.dark.value = true;
 *
 * @example
 *   // Con acciones
 *   const cart = createStore(
 *     { items: [] as string[], total: 0 },
 *     (s) => ({
 *       add:    (item: string) => s.items.update(arr => [...arr, item]),
 *       clear:  ()             => cart.$reset(),
 *     })
 *   );
 *
 *   cart.add("Manzana");
 *   cart.items.value;      // ["Manzana"]
 *   cart.clear();
 *   cart.items.value;      // []
 */
export function createStore<
    T extends Record<string, unknown>,
    A extends Record<string, unknown> = Record<never, never>,
>(
    initialState: T,
    actionsFactory?: (signals: StoreSignals<T>) => A
): Store<T, A> {
    // 1. Crear un Signal por cada propiedad
    const signals = {} as Record<string, Signal<unknown>>;
    for (const key of Object.keys(initialState)) {
        signals[key] = signal(initialState[key]);
    }

    const typedSignals = signals as unknown as StoreSignals<T>;

    // 2. $reset: restaura cada signal a su valor inicial
    function $reset() {
        for (const key of Object.keys(initialState)) {
            (signals[key] as Signal<unknown>).value = initialState[key];
        }
    }

    // 3. Construir el store base
    const store = Object.assign(
        Object.create(null) as object,
        typedSignals,
        { $reset }
    ) as Store<T, A>;

    // 4. Si hay acciones, crearlas y mezclarlas en el store
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
