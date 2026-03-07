// ═══════════════════════════════════════════════
//  Nix.js ❄️ — Provide / Inject  (Fase 13)
// ═══════════════════════════════════════════════
//
//  Inyección de dependencias sin prop drilling:
//
//    Proveedor:
//      class ThemeProvider extends NixComponent {
//        theme = signal("dark");
//        onInit() { provide(THEME_KEY, this.theme); }
//        render()  { return html`...`; }
//      }
//
//    Consumidor (cualquier nivel de profundidad):
//      class Button extends NixComponent {
//        theme = inject(THEME_KEY);   // Signal<string> | undefined
//        render() {
//          return html`<button class=${() => this.theme?.value}>OK</button>`;
//        }
//      }
//
//  Cómo funciona:
//    Cada componente tiene su propio mapa de valores provistos.
//    Al renderizar, el motor apila los mapas padre → hijo.
//    inject() busca desde el tope de la pila hacia la raíz.

// ─── Tipos públicos ───────────────────────────────────────────────────────────

/**
 * Clave tipada para provide/inject.
 * El parámetro genérico T garantiza coherencia entre proveedor y consumidor.
 *
 * @example
 *   const THEME_KEY = createInjectionKey<Signal<string>>("theme");
 */
export type InjectionKey<T> = symbol & { readonly __nixType?: T };

/**
 * Crea una InjectionKey única y tipada.
 * Cada llamada produce un símbolo distinto, evitando colisiones.
 *
 * @param description Nombre descriptivo (aparece en Symbol.toString())
 */
export function createInjectionKey<T>(description?: string): InjectionKey<T> {
    return Symbol(description) as InjectionKey<T>;
}

// ─── Stack interno ────────────────────────────────────────────────────────────

/** Pila de mapas provide, uno por componente activo en el árbol de render. */
const _stack: Map<unknown, unknown>[] = [];

/** @internal — devuelve copia del stack (para capturar en closures de efectos). */
export function _captureContextSnapshot(): Map<unknown, unknown>[] {
    return [..._stack];
}

/** @internal — push de un contexto vacío para un nuevo componente (render estático). */
export function _pushComponentContext(): void {
    _stack.push(new Map());
}

/** @internal — pop del contexto del componente actual (render estático). */
export function _popComponentContext(): void {
    _stack.pop();
}

/**
 * @internal — ejecuta `fn` con `parentSnapshot` como ancestros y un nuevo
 * contexto vacío en el tope, luego restaura el stack previo.
 *
 * Usado por efectos reactivos que pueden re-ejecutarse fuera del árbol de
 * rendering original (p.ej. NixComponents dentro de `() => new MyComp()`).
 */
export function _withComponentContext<T>(
    parentSnapshot: Map<unknown, unknown>[],
    fn: () => T
): T {
    const saved = _stack.splice(0);
    parentSnapshot.forEach(m => _stack.push(m));
    _stack.push(new Map()); // contexto propio, vacío al principio
    try {
        return fn();
    } finally {
        _stack.splice(0);
        saved.forEach(m => _stack.push(m));
    }
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Registra un valor para que los componentes descendientes puedan obtenerlo
 * con `inject()`.
 *
 * Debe llamarse en `onInit()` o en el constructor de un `NixComponent`.
 * Si se llama fuera del contexto de render de un componente, lanza un error.
 *
 * @example
 *   class ThemeProvider extends NixComponent {
 *     theme = signal("dark");
 *     onInit() { provide(THEME_KEY, this.theme); }   // ← aquí
 *     render()  { return html`${new ThemedButton()}`; }
 *   }
 */
export function provide<T>(
    key: InjectionKey<T> | string | symbol,
    value: T
): void {
    const top = _stack[_stack.length - 1];
    if (!top) {
        throw new Error(
            "[Nix] provide() debe llamarse dentro de onInit() de un NixComponent."
        );
    }
    top.set(key, value);
}

/**
 * Obtiene un valor provisto por un componente ancestro.
 * Busca de hijo a padre; retorna `undefined` si la clave no fue provista.
 *
 * Úsalo como propiedad de clase o dentro de `onInit()`.
 *
 * @example
 *   class ThemedButton extends NixComponent {
 *     theme = inject(THEME_KEY);   // Signal<string> | undefined
 *     render() {
 *       return html`<button class=${() => this.theme?.value ?? "light"}>OK</button>`;
 *     }
 *   }
 */
export function inject<T>(
    key: InjectionKey<T> | string | symbol
): T | undefined {
    for (let i = _stack.length - 1; i >= 0; i--) {
        if (_stack[i].has(key)) {
            return _stack[i].get(key) as T;
        }
    }
    return undefined;
}
