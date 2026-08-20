import { isNixComponent } from "../lifecycle.js";
import type { NixComponent } from "../lifecycle.js";
import { provide, inject, createInjectionKey } from "../context.js";
import type { NixTemplate, NixMountHandle, NixRef, PortalOutlet } from "./types.js";
import { _mountComponent } from "./mount-helpers.js";

// =============================================================================
// --- PortalOutlet ---
// =============================================================================

/** Creates a PortalOutlet token for decoupled portal targeting. */
export function createPortalOutlet(): PortalOutlet {
    return { __isPortalOutlet: true as const, _container: null };
}

/** Declares the DOM anchor for a PortalOutlet inside a template. */
export function portalOutlet(outlet: PortalOutlet): NixTemplate {
    return {
        __isNixTemplate: true as const,
        mount(container: Element | string): NixMountHandle {
            const el =
                typeof container === "string"
                    ? (document.querySelector(container) ?? document.body)
                    : container;
            const cleanup = this._render(el, null);
            return { unmount: cleanup };
        },
        _render(parent: Node, before: Node | null): () => void {
            const el = document.createElement("div");
            el.setAttribute("data-nix-outlet", "");
            outlet._container = el;
            parent.insertBefore(el, before);
            return () => {
                outlet._container = null;
                el.remove();
            };
        },
    };
}

// =============================================================================
// --- portal() ---
// =============================================================================

/**
 * Renders `content` into `target` instead of the current tree position.
 * Useful for modals, tooltips, and overlays that must escape overflow clipping.
 * Returns a NixTemplate — works inside reactive conditionals.
 *
 * @param content  Template or component to render.
 * @param target   CSS selector, Element, PortalOutlet, or NixRef. Defaults to `document.body`.
 */
export function portal(
    content: NixTemplate | NixComponent,
    target: Element | string | PortalOutlet | NixRef<Element> = document.body
): NixTemplate {
    return {
        __isNixTemplate: true as const,

        mount(container: Element | string): NixMountHandle {
            const el =
                typeof container === "string"
                    ? (document.querySelector(container) ?? document.body)
                    : container;
            const cleanup = this._render(el, null);
            return { unmount: cleanup };
        },

        _render(_parent: Node, _before: Node | null): () => void {
            let targetEl: Element;
            if (typeof target === "string") {
                targetEl = document.querySelector(target) ?? document.body;
            } else if (target instanceof Element) {
                targetEl = target;
            } else if ("__isPortalOutlet" in target) {
                targetEl = (target as PortalOutlet)._container ?? document.body;
            } else {
                targetEl = (target as NixRef<Element>).el ?? document.body;
            }

            if (isNixComponent(content)) {
                return _mountComponent(content, targetEl, null);
            }

            return content._render(targetEl, null);
        },
    };
}

// =============================================================================
// --- Portal outlet via provide/inject ---
// =============================================================================

const _OUTLET_KEY = createInjectionKey<PortalOutlet>("nix:portal-outlet");

/** Provides a PortalOutlet to descendant components via dependency injection. */
export function provideOutlet(outlet: PortalOutlet): void {
    provide(_OUTLET_KEY, outlet);
}

/** Injects the nearest PortalOutlet provided by an ancestor. */
export function injectOutlet(): PortalOutlet | undefined {
    return inject(_OUTLET_KEY);
}
