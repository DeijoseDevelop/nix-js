// ═══════════════════════════════════════════════
//  Nix.js ❄️ — Lifecycle Hooks  (Fase 4)
// ═══════════════════════════════════════════════
//
//  Orden de ejecución garantizado:
//
//    new MyComponent()   ← constructor (opcional)
//          ↓
//    onInit()            ← sin DOM, síncrono, antes de render()
//          ↓
//    render()            ← retorna NixTemplate
//          ↓
//    [DOM insertado]
//          ↓
//    onMount()           ← con DOM; puede retornar cleanup
//          ↓
//    ...signals actualizan efectos internos...
//          ↓
//    onUnmount()         ← DOM aún presente
//    cleanup de onMount()
//          ↓
//    [DOM removido]
//
//  onError(err)  → captura errores de onInit y onMount.

import type { NixTemplate } from "./template";

// ─── NixChildren ──────────────────────────────────────────────────────────────

/**
 * Tipos válidos para pasar como children a un componente.
 * Acepta un template, un componente, arrays de ellos, o nada.
 */
export type NixChildren =
    | NixTemplate
    | NixComponent
    | Array<NixTemplate | NixComponent>
    | null
    | undefined;

// ─── NixComponent ─────────────────────────────────────────────────────────────

/**
 * Clase base para componentes con lifecycle.
 *
 * Implementa `render()` y haz override de los hooks que necesites.
 *
 * @example
 *   class Timer extends NixComponent {
 *     ticks = signal(0);
 *
 *     onMount() {
 *       const id = setInterval(() => this.ticks.update(n => n + 1), 1000);
 *       return () => clearInterval(id);   // cleanup automático al desmontar
 *     }
 *
 *     render() {
 *       return html`<span>${() => this.ticks.value}s</span>`;
 *     }
 *   }
 *
 *   mount(new Timer(), "#app");
 */
export abstract class NixComponent {
    /** @internal – marca que identifica instancias NixComponent en el engine. */
    readonly __isNixComponent = true as const;

    /**
     * Slot por defecto — contenido hijo que el componente padre inyecta.
     *
     * Úsalo en `render()` como cualquier valor interpolado:
     * ```typescript
     * render() {
     *   return html`<div class="card">${this.children}</div>`;
     * }
     * ```
     * Se puede asignar directamente o con el método fluido `setChildren()`.
     */
    children?: NixChildren;

    /** @internal */
    private _slots = new Map<string, NixChildren>();

    /**
     * Asigna el slot por defecto. Versión fluida de `this.children = content`.
     * @returns `this` para encadenar con `setSlot()`.
     *
     * @example
     *   html`${new Card().setChildren(html`<p>Body</p>`)}`
     */
    setChildren(content: NixChildren): this {
        this.children = content;
        return this;
    }

    /**
     * Asigna un slot con nombre. El componente lo lee con `this.slot(name)`.
     * @returns `this` para encadenar.
     *
     * @example
     *   new Card()
     *     .setSlot("header", html`<h1>Título</h1>`)
     *     .setSlot("footer", html`<small>Footer</small>`)
     *     .setChildren(html`<p>Cuerpo</p>`)
     */
    setSlot(name: string, content: NixChildren): this {
        this._slots.set(name, content);
        return this;
    }

    /**
     * Obtiene el contenido de un slot con nombre.
     * Úsalo dentro de `render()`:
     * ```typescript
     * render() {
     *   return html`
     *     <div>
     *       <header>${this.slot("header")}</header>
     *       <main>${this.children}</main>
     *       <footer>${this.slot("footer")}</footer>
     *     </div>
     *   `;
     * }
     * ```
     */
    slot(name: string): NixChildren {
        return this._slots.get(name);
    }

    /**
     * Debe implementarse: retorna el template del componente.
     * Se llama UNA sola vez al montar — las actualizaciones ocurren por signals.
     */
    abstract render(): NixTemplate;

    /**
     * Llamado ANTES de `render()` — sin DOM todavía.
     * Útil para inicializar estado complejo derivado de props u otras
     * operaciones síncronas que render() necesita.
     *
     * Los errores aquí son capturados por `onError` si está implementado.
     *
     * @example
     *   onInit() {
     *     this.derived = computed(() => this.base.value * 2);
     *   }
     */
    onInit?(): void;

    /**
     * Llamado DESPUÉS de que el componente se inserta en el DOM.
     * Si retorna una función, se usa como cleanup automático al desmontar.
     *
     * @example
     *   onMount() {
     *     const id = setInterval(() => this.count.update(n => n + 1), 1000);
     *     return () => clearInterval(id);
     *   }
     */
    onMount?(): (() => void) | void;

    /**
     * Llamado ANTES de remover el componente del DOM.
     * Se ejecuta siempre al desmontar, incluso si no se definió onMount.
     */
    onUnmount?(): void;

    /**
     * Captura errores lanzados dentro de `onMount`.
     * Si se implementa, el error queda absorbido y el componente permanece montado.
     * Si no se implementa, el error se re-lanza.
     */
    onError?(err: unknown): void;
}

// ─── Helper de tipo ───────────────────────────────────────────────────────────

/**
 * @internal – Verifica si un valor es una instancia de NixComponent.
 */
export function isNixComponent(v: unknown): v is NixComponent {
    return (
        v != null &&
        typeof v === "object" &&
        (v as Record<string, unknown>).__isNixComponent === true
    );
}
