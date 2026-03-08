import type { NixTemplate, NixMountHandle } from "./template";
import { isNixComponent, type NixComponent } from "./lifecycle";
import { _pushComponentContext, _popComponentContext } from "./context";

/**
 * Mounts a NixTemplate or NixComponent into the DOM.
 *
 *   mount(Counter(), "#app");   // NixTemplate (function component)
 *   mount(new Timer(), "#app"); // NixComponent (class with lifecycle)
 *
 * @param component NixTemplate (result of html``) or a NixComponent instance.
 * @param container CSS selector or HTMLElement to mount into.
 * @returns         { unmount() } — disposes effects and removes DOM.
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
            throw new Error(`[Nix] mount: container not found: ${container}`);
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
