// ═══════════════════════════════════════════════
//  Nix.js ❄️ — Componentes  (Fase 3)
// ═══════════════════════════════════════════════
//
//  Un componente en Nix.js es una función simple:
//
//    function MyComponent(props) {
//      const count = signal(0);
//      return html`<button @click=${() => count.update(n => n+1)}>
//                    ${() => count.value}
//                  </button>`;
//    }
//
//  No hay clases, no hay decoradores, no hay registro.
//  Las actualizaciones ocurren via signals — la función
//  se ejecuta UNA sola vez.
//
//  mount(template, container) — monta la app raíz en el DOM.

import type { NixTemplate, NixMountHandle } from "./template";
import { isNixComponent, type NixComponent } from "./lifecycle";
import { _pushComponentContext, _popComponentContext } from "./context";

/**
 * Monta un NixTemplate o NixComponent en el DOM.
 *
 *   mount(App(), "#app");           // NixTemplate (función componente)
 *   mount(new Timer(), "#app");     // NixComponent (clase con lifecycle)
 *
 * @param component NixTemplate (resultado de html``) o instancia de NixComponent.
 * @param container Selector CSS o HTMLElement donde se insertará.
 * @returns         { unmount() } para limpiar effects y remover el DOM.
 */
export function mount(
    component: NixTemplate | NixComponent,
    container: Element | string
): NixMountHandle {
    if (isNixComponent(component)) {
        const el =
            typeof container === "string"
                ? (document.querySelector(container) as Element)
                : container;
        if (!el) {
            throw new Error(`[Nix] mount: contenedor no encontrado: ${container}`);
        }

        _pushComponentContext();
        let cleanup: () => void;
        try {
            try { component.onInit?.(); } catch (e) { if (component.onError) component.onError(e); else throw e; }
            cleanup = component.render()._render(el, null);
        } finally {
            _popComponentContext();
        }
        let mountCleanup: (() => void) | undefined;

        try {
            const ret = component.onMount?.();
            if (typeof ret === "function") mountCleanup = ret;
        } catch (e) {
            if (component.onError) component.onError(e);
            else throw e;
        }

        return {
            unmount() {
                try { component.onUnmount?.(); } catch { /* ignore */ }
                try { mountCleanup?.(); } catch { /* ignore */ }
                cleanup();
            },
        };
    }

    // NixTemplate: delegar al método .mount() interno
    return (component as NixTemplate).mount(container);
}
