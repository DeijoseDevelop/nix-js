// ═══════════════════════════════════════════════
//  Nix.js ❄️ — Sistema de Reactividad
// ═══════════════════════════════════════════════
//
//  Conceptos:
//
//    signal(valor)    → dato reactivo, al cambiar notifica
//    effect(fn)       → se re-ejecuta cuando sus signals cambian
//    computed(fn)     → valor derivado que se auto-actualiza
//    batch(fn)        → agrupa cambios en 1 sola actualización
//
//  Cómo funciona:
//
//    1. Un effect se ejecuta y LEE signals
//    2. Cada signal registra "este effect me está leyendo"
//    3. Cuando el signal CAMBIA, re-ejecuta sus effects
//    4. El effect se des-suscribe de las viejas y se suscribe a las nuevas
//
//    signal.value (get)  →  "Oye signal, te estoy leyendo"
//    signal.value (set)  →  "Oye effects, cambié, re-ejecútense"

// ── Tracking: saber quién está observando ──

let activeEffect: (() => void) | null = null;
const effectStack: ((() => void) | null)[] = [];

let activeDeps: Set<Signal<any>> | null = null;
const depsStack: (Set<Signal<any>> | null)[] = [];

// ── Error boundary support ────────────────────────────────────────────────────

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

// ── Batching: agrupar notificaciones ──

let batchLevel = 0;
const pendingEffects = new Set<() => void>();

// ── Effect recursion guard ──

const MAX_EFFECT_DEPTH = 100;
let effectDepth = 0;

// ── Signal ──

export class Signal<T> {
    private _value: T;
    private _subs = new Set<() => void>();

    constructor(initialValue: T) {
        this._value = initialValue;
    }

    /**
     * Leer el valor.
     * Si hay un effect activo, se suscribe automáticamente.
     */
    get value(): T {
        if (activeEffect) {
            this._subs.add(activeEffect);
            activeDeps?.add(this);
        }
        return this._value;
    }

    /**
     * Escribir un nuevo valor.
     * Si es diferente al actual, notifica a todos los effects suscritos.
     */
    set value(newValue: T) {
        if (Object.is(this._value, newValue)) return;
        this._value = newValue;
        this._notify();
    }

    /**
     * Modificar el valor con una función.
     *   count.update(n => n + 1)
     */
    update(fn: (current: T) => T): void {
        this.value = fn(this._value);
    }

    /**
     * Leer SIN suscribirse.
     * Útil cuando necesitas el valor pero no quieres
     * que el effect se re-ejecute si cambia.
     */
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

// ── Factory functions ──

export function signal<T>(initialValue: T): Signal<T> {
    return new Signal(initialValue);
}

/**
 * Ejecuta una función y la RE-EJECUTA cada vez que
 * algún signal leído dentro de ella cambie.
 *
 * Retorna una función dispose() para destruir el effect.
 *
 *   const dispose = effect(() => {
 *     console.log(count.value);
 *     return () => console.log("cleanup");
 *   });
 *
 *   dispose();
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

/**
 * Valor derivado que se recalcula automáticamente.
 *
 *   const doubled = computed(() => count.value * 2);
 */
export function computed<T>(fn: () => T): Signal<T> {
    const s = new Signal<T>(undefined as T);

    effect(() => {
        s.value = fn();
    });

    return s;
}

/**
 * Agrupa múltiples cambios para que los effects
 * se ejecuten UNA sola vez al final.
 *
 *   batch(() => {
 *     x.value = 1;
 *     y.value = 2;
 *   });
 */
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

/**
 * Ejecuta `fn` sin suscribirse a ninguna signal que lea dentro de ella.
 * Útil para leer valores reactivos sin que esas lecturas re-disparen el
 * efecto actual (p.ej. en callbacks de `watch`).
 *
 *   const total = untrack(() => price.value * qty.value); // no se suscribe
 */
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

// ── watch ──

export interface WatchOptions {
    /**
     * Si es `true`, el callback se ejecuta inmediatamente con el valor
     * actual antes de que haya ningún cambio.  Por defecto: `false`.
     */
    immediate?: boolean;
    /**
     * Si es `true`, el watcher se elimina automáticamente después de la
     * primera vez que el callback se dispara.  Por defecto: `false`.
     */
    once?: boolean;
}

/**
 * Observa una fuente reactiva y ejecuta `callback(newValue, oldValue)` cada
 * vez que cambia.
 *
 * La fuente puede ser:
 *  - Un getter: `() => count.value + other.value`
 *  - Una Signal directamente: `count`
 *
 * Retorna una función `dispose()` para detener la observación.
 *
 * @example
 * const stop = watch(
 *   () => user.value.name,
 *   (newName, oldName) => console.log(newName, oldName),
 *   { immediate: true }
 * );
 * stop(); // deja de observar
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

// ── nextTick ──

/**
 * Espera a que todos los efectos síncronos pendientes hayan corrido y el
 * DOM esté actualizado, devolviendo una promesa que resuelve en el próximo
 * microtask.
 *
 * Úsala cuando necesitas leer el DOM *después* de un cambio reactivo:
 *
 *   count.value++;
 *   await nextTick();
 *   console.log(el.textContent); // ya refleja el nuevo valor
 *
 * También acepta un callback opcional:
 *
 *   nextTick(() => el.focus());
 */
export function nextTick(fn?: () => void): Promise<void> {
    return fn ? Promise.resolve().then(fn) : Promise.resolve();
}