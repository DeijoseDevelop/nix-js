import { effect } from "../reactivity";
import { isNixComponent } from "../lifecycle";
import type { NixComponent } from "../lifecycle";
import type { NixTemplate, NixMountHandle, TransitionContent } from "./types";
import { COMMENT } from "./types";
import { _mountComponentSilent } from "./mount-helpers";

// =============================================================================
// --- TransitionOptions ---
// =============================================================================

/**
 * Options for `transition()`.  All class-name overrides are optional — by
 * default they are derived from `name` (default `"nix"`).
 *
 * | phase        | from class        | active class        | to class        |
 * |--------------|-------------------|---------------------|-----------------|
 * | enter        | `{n}-enter-from`  | `{n}-enter-active`  | `{n}-enter-to`  |
 * | leave        | `{n}-leave-from`  | `{n}-leave-active`  | `{n}-leave-to`  |
 */
export interface TransitionOptions {
    /**
     * Prefix for all generated CSS classes. Default `"nix"`.
     * e.g. `name: "fade"` generates `.fade-enter-from`, `.fade-leave-to`, …
     */
    name?: string;
    enterFrom?: string;
    enterActive?: string;
    enterTo?: string;
    leaveFrom?: string;
    leaveActive?: string;
    leaveTo?: string;
    /**
     * When `true` the enter transition also plays on the very first render
     * (similar to Vue's `appear`). Default `false`.
     */
    appear?: boolean;
    /**
     * Fallback duration in **milliseconds** used when no `transition-duration`
     * or `animation-duration` is found on the element via `getComputedStyle`.
     */
    duration?: number;
    onBeforeEnter?: (el: Element) => void;
    onAfterEnter?: (el: Element) => void;
    onBeforeLeave?: (el: Element) => void;
    onAfterLeave?: (el: Element) => void;
}

// =============================================================================
// --- Internal transition helpers ---
// =============================================================================

function _resolveTransitionClasses(opts: TransitionOptions) {
    const n = opts.name ?? "nix";
    return {
        enterFrom: opts.enterFrom ?? `${n}-enter-from`,
        enterActive: opts.enterActive ?? `${n}-enter-active`,
        enterTo: opts.enterTo ?? `${n}-enter-to`,
        leaveFrom: opts.leaveFrom ?? `${n}-leave-from`,
        leaveActive: opts.leaveActive ?? `${n}-leave-active`,
        leaveTo: opts.leaveTo ?? `${n}-leave-to`,
    };
}

function _cssMaxDuration(cssValue: string): number {
    return Math.max(0, ...cssValue.split(",").map((s) => parseFloat(s.trim()) || 0));
}

function _waitTransitionEnd(el: Element, fallbackMs = 0): Promise<void> {
    return new Promise((resolve) => {
        const st = getComputedStyle(el);
        const ms =
            Math.max(
                _cssMaxDuration(st.transitionDuration || "0"),
                _cssMaxDuration(st.animationDuration || "0"),
            ) * 1000;
        const wait = ms > 0 ? ms + 100 : fallbackMs;

        if (wait <= 0) { resolve(); return; }

        let timerId: ReturnType<typeof setTimeout>;
        const done = (e: Event) => {
            if (e.target !== el) return;
            clearTimeout(timerId);
            el.removeEventListener("transitionend", done);
            el.removeEventListener("animationend", done);
            resolve();
        };
        el.addEventListener("transitionend", done);
        el.addEventListener("animationend", done);
        timerId = setTimeout(() => {
            el.removeEventListener("transitionend", done);
            el.removeEventListener("animationend", done);
            resolve();
        }, wait);
    });
}

// =============================================================================
// --- transition() ---
// =============================================================================

/**
 * Wraps content with CSS class-based enter/leave transitions.
 * Static content plays enter on mount (only with `appear: true`).
 * Reactive `() => Template | null` auto-animates enter/leave on toggle.
 */
export function transition(
    content: TransitionContent,
    options: TransitionOptions = {},
): NixTemplate {
    const cls = _resolveTransitionClasses(options);

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
            const marker = document.createComment(COMMENT.TRANSITION);
            parent.insertBefore(marker, before);

            let contentCleanup: (() => void) | null = null;
            let leaveCleanup: (() => void) | null = null;
            let leaveGen = 0;
            let isFirstRender = true;

            /** Find first Element node between `marker` and `before`. */
            const getEl = (): Element | null => {
                let node: Node | null = marker.nextSibling;
                while (node && node !== before) {
                    if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
                    node = node.nextSibling;
                }
                return null;
            };

            function mountContent(tpl: NixTemplate | NixComponent): () => void {
                if (isNixComponent(tpl)) {
                    return _mountComponentSilent(tpl as NixComponent, parent, before);
                }
                return (tpl as NixTemplate)._render(parent, before);
            }

            /** Mount content and play enter animation (does NOT block). */
            const doEnter = (tpl: NixTemplate | NixComponent, skipAnim = false): void => {
                leaveGen++;
                if (leaveCleanup) {
                    leaveCleanup();
                    leaveCleanup = null;
                }

                contentCleanup = mountContent(tpl);

                const el = getEl();
                const shouldAnimate = el && (!isFirstRender || options.appear) && !skipAnim;
                if (shouldAnimate) {
                    const gen = leaveGen;
                    const doIt = async () => {
                        options.onBeforeEnter?.(el);
                        el.classList.add(cls.enterFrom, cls.enterActive);
                        void el.getBoundingClientRect();
                        await new Promise<void>((r) => requestAnimationFrame(() => r()));
                        if (leaveGen !== gen) return;
                        el.classList.remove(cls.enterFrom);
                        el.classList.add(cls.enterTo);
                        await _waitTransitionEnd(el, options.duration);
                        if (leaveGen !== gen) return;
                        el.classList.remove(cls.enterActive, cls.enterTo);
                        options.onAfterEnter?.(el);
                    };
                    doIt().catch(() => { /* ignore */ });
                }
                isFirstRender = false;
            };

            /** Remove current content after playing leave animation (does NOT block). */
            const doLeave = (): void => {
                const savedCleanup = contentCleanup;
                contentCleanup = null;
                const el = getEl();

                if (!el) { savedCleanup?.(); return; }

                const gen = ++leaveGen;
                leaveCleanup = savedCleanup ?? null;

                const doIt = async () => {
                    options.onBeforeLeave?.(el);
                    el.classList.add(cls.leaveFrom, cls.leaveActive);
                    void el.getBoundingClientRect();
                    await new Promise<void>((r) => requestAnimationFrame(() => r()));
                    if (leaveGen !== gen) return;
                    el.classList.remove(cls.leaveFrom);
                    el.classList.add(cls.leaveTo);
                    await _waitTransitionEnd(el, options.duration);
                    if (leaveGen !== gen) return;
                    el.classList.remove(cls.leaveActive, cls.leaveTo);
                    options.onAfterLeave?.(el);
                    leaveCleanup?.();
                    leaveCleanup = null;
                };
                doIt().catch(() => { /* ignore */ });
            };

            let disposeWatcher: (() => void) | null = null;

            if (typeof content === "function" && !isNixComponent(content as unknown)) {
                const getter = content as () => NixTemplate | NixComponent | null;
                let prevVal: NixTemplate | NixComponent | null = null;

                disposeWatcher = effect(() => {
                    const val = getter();
                    const wasNull = prevVal === null;
                    const isNull = val === null;

                    if (wasNull && !isNull) {
                        doEnter(val!);
                    } else if (!wasNull && isNull) {
                        doLeave();
                    } else if (!wasNull && !isNull) {
                        leaveGen++;
                        leaveCleanup?.();
                        leaveCleanup = null;
                        contentCleanup?.();
                        contentCleanup = null;
                        doEnter(val!, true);
                    }
                    prevVal = val;
                });
                isFirstRender = false;
            } else {
                doEnter(content as NixTemplate | NixComponent);
            }

            return () => {
                leaveGen++;
                disposeWatcher?.();
                contentCleanup?.();
                leaveCleanup?.();
                contentCleanup = null;
                leaveCleanup = null;
                marker.remove();
            };
        },
    };
}
