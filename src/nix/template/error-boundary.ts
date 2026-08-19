import { _pushErrorHandler, _popErrorHandler } from "../reactivity";
import { isNixComponent } from "../lifecycle";
import type { NixComponent } from "../lifecycle";
import { _pushComponentContext, _popComponentContext } from "../context";
import type { NixTemplate, NixMountHandle, ErrorFallback } from "./types";
import { COMMENT } from "./types";
import { _mountComponentSilent } from "./mount-helpers";

// =============================================================================
// --- Error Boundary ---
// =============================================================================

/**
 * Wraps `content` in an error boundary. If rendering or a reactive update
 * throws, the boundary tears down the broken subtree and renders `fallback`.
 */
export function createErrorBoundary(
    content: NixTemplate | NixComponent,
    fallback: ErrorFallback
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

        _render(parent: Node, before: Node | null): () => void {
            const marker = document.createComment(COMMENT.ERROR_BOUNDARY);
            parent.insertBefore(marker, before);

            let activeCleanup: (() => void) | null = null;
            let errored = false;
            let initialRenderDone = false;
            let deferredError: unknown = undefined;
            let hasDeferredError = false;

            // Renders the fallback outside the error handler window.
            // Uses marker.parentNode (not captured `parent`) because `parent` may be
            // a stale DocumentFragment that was already flushed to the live DOM.
            const renderFallback = (err: unknown): void => {
                const liveParent = marker.parentNode;
                if (!liveParent) return;

                let fb: NixTemplate | NixComponent;
                try {
                    fb =
                        typeof fallback === "function" && !isNixComponent(fallback as object)
                            ? (fallback as (err: unknown) => NixTemplate | NixComponent)(err)
                            : (fallback as NixTemplate | NixComponent);
                } catch (e) {
                    console.error("[nix-js] Error boundary fallback threw while producing the fallback UI:", e);
                    activeCleanup = renderBrokenFallback(liveParent, before);
                    return;
                }

                // Capture reactive errors from effects created inside the fallback.
                _pushErrorHandler(fallbackReactiveErrorHandler);
                try {
                    if (isNixComponent(fb)) {
                        activeCleanup = _mountComponentSilent(fb, liveParent, before);
                    } else {
                        activeCleanup = fb._render(liveParent, before);
                    }
                } catch (e) {
                    console.error("[nix-js] Error boundary fallback threw during render:", e);
                    activeCleanup?.();
                    activeCleanup = renderBrokenFallback(liveParent, before);
                } finally {
                    _popErrorHandler();
                }
            };

            const fallbackReactiveErrorHandler = (e: unknown): void => {
                console.error("[nix-js] Error boundary fallback threw during a reactive update:", e);
                activeCleanup?.();
                activeCleanup = null;
                const liveParent = marker.parentNode;
                if (liveParent) {
                    activeCleanup = renderBrokenFallback(liveParent, before);
                }
            };

            const renderBrokenFallback = (liveParent: Node, before: Node | null): (() => void) => {
                const el = document.createElement("div");
                el.setAttribute("data-nix-error-boundary", "fallback-failed");
                el.textContent = "[nix-js] Error boundary fallback failed to render.";
                liveParent.insertBefore(el, before);
                return () => el.remove();
            };

            // Called by effects inside `content` when they throw
            const handleReactiveError = (err: unknown): void => {
                if (errored) return;
                errored = true;
                if (initialRenderDone) {
                    activeCleanup?.();
                    activeCleanup = null;
                    renderFallback(err);
                } else {
                    deferredError = err;
                    hasDeferredError = true;
                }
            };

            _pushErrorHandler(handleReactiveError);
            try {
                if (isNixComponent(content)) {
                    _pushComponentContext();
                    try {
                        try { content.onInit?.(); } catch (e) {
                            if (content.onError) content.onError(e); else throw e;
                        }
                        activeCleanup = content.render()._render(parent, before);
                    } finally {
                        _popComponentContext();
                    }
                    if (!errored) {
                        try {
                            const ret = content.onMount?.();
                            const prev = activeCleanup;
                            activeCleanup = () => {
                                try { content.onUnmount?.(); } catch { /* ignore */ }
                                if (typeof ret === "function") try { ret(); } catch { /* ignore */ }
                                prev?.();
                            };
                        } catch (e) {
                            if (content.onError) content.onError(e); else throw e;
                        }
                    }
                } else {
                    activeCleanup = content._render(parent, before);
                }
            } catch (err) {
                errored = true;
                activeCleanup?.();
                activeCleanup = null;
                deferredError = err;
                hasDeferredError = true;
            } finally {
                _popErrorHandler();
                initialRenderDone = true;
            }

            if (hasDeferredError) {
                activeCleanup?.();
                activeCleanup = null;
                renderFallback(deferredError);
            }

            return () => {
                activeCleanup?.();
                marker.remove();
            };
        },
    };
}
