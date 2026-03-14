import { effect, _pushErrorHandler, _popErrorHandler } from "./reactivity";
import { isNixComponent } from "./lifecycle";
import type { NixComponent } from "./lifecycle";
import {
    _captureContextSnapshot,
    _pushComponentContext,
    _popComponentContext,
    _withComponentContext,
    provide,
    inject,
    createInjectionKey,
} from "./context";

const COMMENT = {
    SCOPE: "nix-scope",
    ERROR_BOUNDARY: "nix-eb",
    TRANSITION: "nix-t",
    KEYED_START: "nix-ks",
    KEYED_END: "nix-ke",
    KEYED_ZONE: "nix-kz",  // Marks the start of the entire keyed list zone
} as const;

// --- Public types ---

interface KEntry {
    start: Comment;
    end: Comment;
    cleanup: () => void;
}

export interface NixTemplate {
    readonly __isNixTemplate: true;
    /** Mounts the template into a container element (public / root API). */
    mount(container: Element | string): NixMountHandle;
    /** @internal Renders before `before` node (or appends to `parent`). Returns cleanup. */
    _render(parent: Node, before: Node | null): () => void;
}

export interface NixMountHandle {
    unmount(): void;
}

/** Direct reference to a DOM element, assigned on mount and cleared on unmount. */
export interface NixRef<T extends Element = Element> {
    el: T | null;
}

/** Creates an empty `NixRef`. Use as `ref` attribute value in templates. */
export function ref<T extends Element = Element>(): NixRef<T> {
    return { el: null };
}

// --- show / hide ---

/** Toggles element visibility via `display: none` without unmounting. */
export function showWhen(el: HTMLElement, condition: boolean): void {
    if (!condition) {
        if (el.style.display !== "none") el.style.display = "none";
    } else {
        if (el.style.display === "none") el.style.display = "";
    }
}

/** Keyed list result for efficient DOM diffing via `repeat()`. */
export interface KeyedList<T = unknown> {
    readonly __isKeyedList: true;
    readonly items: T[];
    readonly keyFn: (item: T, index: number) => string | number;
    readonly renderFn: (item: T, index: number) => NixTemplate | NixComponent;
}

/**
 * Creates a keyed list for efficient DOM reconciliation.
 * Use instead of `.map()` when the list changes frequently.
 */
export function repeat<T>(
    items: T[],
    keyFn: (item: T, index: number) => string | number,
    renderFn: (item: T, index: number) => NixTemplate | NixComponent
): KeyedList<T> {
    return { __isKeyedList: true as const, items, keyFn, renderFn };
}

// =============================================================================
// --- Component mounting helpers ---
// =============================================================================

/**
 * Renders a NixComponent into the DOM and calls onMount immediately.
 * Propagates errors through onError (or re-throws if not present).
 * Returns a full cleanup function (onUnmount + mountCleanup + renderCleanup).
 */
function _mountComponent(
    inst: NixComponent,
    parent: Node,
    before: Node | null,
): () => void {
    _pushComponentContext();
    let renderCleanup!: () => void;
    try {
        try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
        renderCleanup = inst.render()._render(parent, before);
    } finally {
        _popComponentContext();
    }
    let mountCleanup: (() => void) | undefined;
    try {
        const ret = inst.onMount?.();
        if (typeof ret === "function") mountCleanup = ret;
    } catch (e) {
        if (inst.onError) inst.onError(e); else throw e;
    }
    return () => {
        try { inst.onUnmount?.(); } catch { /* ignore */ }
        try { mountCleanup?.(); } catch { /* ignore */ }
        renderCleanup();
    };
}

/**
 * Same as `_mountComponent` but silently swallows all lifecycle errors.
 * Used for transition content and error boundary fallbacks where errors
 * inside the fallback/transition itself must not propagate.
 */
function _mountComponentSilent(
    inst: NixComponent,
    parent: Node,
    before: Node | null,
): () => void {
    _pushComponentContext();
    let renderCleanup!: () => void;
    try {
        try { inst.onInit?.(); } catch { /* ignore */ }
        renderCleanup = inst.render()._render(parent, before);
    } finally {
        _popComponentContext();
    }
    let mountRet: (() => void) | undefined;
    try {
        const ret = inst.onMount?.();
        if (typeof ret === "function") mountRet = ret;
    } catch { /* ignore */ }
    return () => {
        try { inst.onUnmount?.(); } catch { /* ignore */ }
        try { mountRet?.(); } catch { /* ignore */ }
        renderCleanup();
    };
}

/**
 * Renders a NixComponent using a captured context snapshot.
 * Used for dynamic/keyed rendering inside reactive effects, where the
 * provide/inject context must be inherited from the point of declaration.
 * Calls onMount immediately. Returns a full cleanup function.
 */
function _mountComponentWithCtx(
    inst: NixComponent,
    parent: Node,
    before: Node | null,
    ctxSnapshot: ReturnType<typeof _captureContextSnapshot>,
): () => void {
    let renderCleanup!: () => void;
    _withComponentContext(ctxSnapshot, () => {
        try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
        renderCleanup = inst.render()._render(parent, before);
    });
    let mountCleanup: (() => void) | undefined;
    try {
        const ret = inst.onMount?.();
        if (typeof ret === "function") mountCleanup = ret;
    } catch (e) {
        if (inst.onError) inst.onError(e); else throw e;
    }
    return () => {
        try { inst.onUnmount?.(); } catch { /* ignore */ }
        try { mountCleanup?.(); } catch { /* ignore */ }
        renderCleanup();
    };
}

/**
 * Renders a NixComponent with *deferred* onMount — used inside `html` template
 * fragments where the DOM nodes are still in a DocumentFragment and onMount must
 * fire only after the fragment is inserted into the live document.
 *
 * Pushes the full cleanup into `disposes` and the onMount call into `postMountHooks`.
 */
function _mountComponentDeferred(
    inst: NixComponent,
    parent: Node,
    before: Node | null,
    postMountHooks: Array<() => void>,
    disposes: Array<() => void>,
): void {
    _pushComponentContext();
    let renderCleanup!: () => void;
    try {
        try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
        renderCleanup = inst.render()._render(parent, before);
    } finally {
        _popComponentContext();
    }
    let mountCleanup: (() => void) | undefined;
    postMountHooks.push(() => {
        try {
            const ret = inst.onMount?.();
            if (typeof ret === "function") mountCleanup = ret;
        } catch (e) {
            if (inst.onError) inst.onError(e); else throw e;
        }
    });
    disposes.push(() => {
        try { inst.onUnmount?.(); } catch { /* ignore */ }
        try { mountCleanup?.(); } catch { /* ignore */ }
        renderCleanup();
    });
}

// =============================================================================
// --- portal ---
// =============================================================================

/**
 * Renders `content` into `target` instead of the current tree position.
 * Useful for modals, tooltips, and overlays that must escape overflow clipping.
 * Returns a NixTemplate — works inside reactive conditionals.
 *
 * @param content  Template or component to render.
 * @param target   CSS selector, Element, PortalOutlet, or NixRef. Defaults to `document.body`.
 */

// --- PortalOutlet ---

/** Opaque token for a named portal target. */
export interface PortalOutlet {
    readonly __isPortalOutlet: true;
    /** @internal */
    _container: Element | null;
}

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

            // NixTemplate: render into targetEl, ignoring the tree position
            return content._render(targetEl, null);
        },
    };
}

// --- Portal outlet via provide/inject ---

const _OUTLET_KEY = createInjectionKey<PortalOutlet>("nix:portal-outlet");

/** Provides a PortalOutlet to descendant components via dependency injection. */
export function provideOutlet(outlet: PortalOutlet): void {
    provide(_OUTLET_KEY, outlet);
}

/** Injects the nearest PortalOutlet provided by an ancestor. */
export function injectOutlet(): PortalOutlet | undefined {
    return inject(_OUTLET_KEY);
}

// =============================================================================
// --- Error Boundary ---
// =============================================================================

/** Fallback: a static template/component, or a factory receiving the error. */
export type ErrorFallback =
    | NixTemplate
    | NixComponent
    | ((err: unknown) => NixTemplate | NixComponent);

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
                const liveParent = marker.parentNode!;

                const fb: NixTemplate | NixComponent =
                    typeof fallback === "function" && !isNixComponent(fallback as object)
                        ? (fallback as (err: unknown) => NixTemplate | NixComponent)(err)
                        : (fallback as NixTemplate | NixComponent);

                if (isNixComponent(fb)) {
                    // Silent: errors inside the fallback must never propagate
                    activeCleanup = _mountComponentSilent(fb, liveParent, before);
                } else {
                    activeCleanup = fb._render(liveParent, before);
                }
            };

            // Called by effects inside `content` when they throw
            const handleReactiveError = (err: unknown): void => {
                if (errored) return;
                errored = true;
                if (initialRenderDone) {
                    // Post-mount: content is fully rendered — tear it down
                    activeCleanup?.();
                    activeCleanup = null;
                    renderFallback(err);
                } else {
                    // During initial _render(): defer — content._render() hasn't
                    // returned its cleanup yet, so we can't tear it down here.
                    deferredError = err;
                    hasDeferredError = true;
                }
            };

            // --- Render content inside the error boundary ---
            // NOTE: this block is intentionally NOT using _mountComponent because the
            // error boundary needs to intercept the `errored` flag between the render
            // phase and the mount phase to decide whether to skip onMount entirely.
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
                // Synchronous throw (e.g. onInit without onError)
                errored = true;
                activeCleanup?.();
                activeCleanup = null;
                deferredError = err;
                hasDeferredError = true;
            } finally {
                // Always pop: effects already captured handleReactiveError as closure
                _popErrorHandler();
                initialRenderDone = true;
            }

            // Handle errors detected during initial render. Now that _render has
            // returned, activeCleanup holds content's cleanup and can be safely invoked.
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

// =============================================================================
// --- Transitions ---
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
     * Prefix for all generated CSS classes.  Default `"nix"`.
     * e.g. `name: "fade"` generates `.fade-enter-from`, `.fade-leave-to`, …
     */
    name?: string;
    /** Override the enter-from class individually. */
    enterFrom?: string;
    /** Override the enter-active class individually. */
    enterActive?: string;
    /** Override the enter-to class individually. */
    enterTo?: string;
    /** Override the leave-from class individually. */
    leaveFrom?: string;
    /** Override the leave-active class individually. */
    leaveActive?: string;
    /** Override the leave-to class individually. */
    leaveTo?: string;
    /**
     * When `true` the enter transition also plays on the very first render
     * (similar to Vue's `appear`).  Default `false`.
     */
    appear?: boolean;
    /**
     * Fallback duration in **milliseconds** used when no `transition-duration`
     * or `animation-duration` is found on the element via `getComputedStyle`.
     */
    duration?: number;
    /** Called synchronously right before the enter classes are added. */
    onBeforeEnter?: (el: Element) => void;
    /** Called after the enter transition has fully completed. */
    onAfterEnter?: (el: Element) => void;
    /** Called synchronously right before the leave classes are added. */
    onBeforeLeave?: (el: Element) => void;
    /** Called after the leave transition has fully completed and the DOM is removed. */
    onAfterLeave?: (el: Element) => void;
}

/** Content that can be wrapped with `transition()`. */
export type TransitionContent =
    | NixTemplate
    | NixComponent
    | (() => NixTemplate | NixComponent | null);

// --- Internal transition helpers ---

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

// --- transition() ---

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

        mount(container) {
            const el =
                typeof container === "string"
                    ? (document.querySelector(container) ?? document.body)
                    : container;
            const cleanup = this._render(el, null);
            return { unmount: cleanup };
        },

        _render(parent, before) {
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

            /**
             * Mount a NixTemplate or NixComponent and return its cleanup.
             * Uses _mountComponentSilent so transition lifecycle errors don't propagate.
             */
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
                        void el.getBoundingClientRect(); // force reflow
                        await new Promise<void>((r) => requestAnimationFrame(() => r()));
                        if (leaveGen !== gen) return; // superseded
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
                    if (leaveGen !== gen) return; // cancelled by enter
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
                        // Both non-null: instant swap (no transition)
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

// =============================================================================
// --- Binding context ---
// =============================================================================

type BindingContext =
    | { type: "node" }
    | { type: "event"; eventName: string; modifiers: string[]; hadOpenQuote: boolean }
    | { type: "attr"; attrName: string; hadOpenQuote: boolean };

/**
 * Determines the binding context (node, event, or attribute) for an interpolated
 * value based on the preceding template string.
 *
 * Note: Partial attribute interpolation is not supported
 * (e.g. `class="prefix-${cls}"` won't work — compute the full string outside).
 */
function detectContext(prevString: string): BindingContext {
    const lastClose = prevString.lastIndexOf(">");
    const lastOpen = prevString.lastIndexOf("<");

    if (lastOpen <= lastClose) {
        return { type: "node" };
    }

    const tagContent = prevString.slice(lastOpen + 1);

    const eventMatch = tagContent.match(/@([\w:.-]+)=["']?$/);
    if (eventMatch) {
        const full = eventMatch[1];
        const parts = full.split(".");
        const eventName = parts[0];
        const modifiers = parts.slice(1);
        return {
            type: "event",
            eventName,
            modifiers,
            hadOpenQuote:
                eventMatch[0].endsWith('"') || eventMatch[0].endsWith("'"),
        };
    }

    const attrMatch = tagContent.match(/([\w:.-]+)=["']?$/);
    if (attrMatch) {
        return {
            type: "attr",
            attrName: attrMatch[1],
            hadOpenQuote:
                attrMatch[0].endsWith('"') || attrMatch[0].endsWith("'"),
        };
    }

    return { type: "node" };
}

// =============================================================================
// --- Static HTML construction with markers ---
// =============================================================================

/**
 * Builds the static HTML string, replacing each interpolated value with
 * a comment marker (node), data-nix-e-N (event), or data-nix-a-N (attribute).
 */
function buildHTML(
    strings: readonly string[],
    contexts: BindingContext[]
): string {
    const skipLeading = new Set<number>();
    let result = "";

    for (let i = 0; i < strings.length; i++) {
        let s = strings[i];

        if (skipLeading.has(i) && (s[0] === '"' || s[0] === "'")) {
            s = s.slice(1);
        }

        if (i < contexts.length) {
            const ctx = contexts[i];

            if (ctx.type === "node") {
                result += s + `<!--nix-${i}-->`;
            } else if (ctx.type === "event") {
                const full = ctx.modifiers.length
                    ? `${ctx.eventName}.${ctx.modifiers.join(".")}`
                    : ctx.eventName;
                const cut = `@${full}=`.length + (ctx.hadOpenQuote ? 1 : 0);
                result += s.slice(0, -cut) + ` data-nix-e-${i}="${ctx.eventName}"`;
                if (ctx.hadOpenQuote) skipLeading.add(i + 1);
            } else {
                const cut =
                    `${ctx.attrName}=`.length + (ctx.hadOpenQuote ? 1 : 0);
                result += s.slice(0, -cut) + ` data-nix-a-${i}="${ctx.attrName}"`;
                if (ctx.hadOpenQuote) skipLeading.add(i + 1);
            }
        } else {
            result += s;
        }
    }

    return result;
}

// =============================================================================
// --- DOM inspection helpers ---
// =============================================================================

function isNixTemplate(v: unknown): v is NixTemplate {
    return (
        v != null &&
        typeof v === "object" &&
        (v as Record<string, unknown>).__isNixTemplate === true
    );
}

function isKeyedList(v: unknown): v is KeyedList {
    return (
        v != null &&
        typeof v === "object" &&
        (v as Record<string, unknown>).__isKeyedList === true
    );
}

// =============================================================================
// --- Path-based marker resolution (replaces TreeWalker + querySelectorAll) ---
// =============================================================================

/**
 * Records the path of childNodes indices from `root` down to `target`.
 * Called once during template cache construction — O(depth) per marker.
 */
function _recordPath(root: Node, target: Node): number[] {
    const path: number[] = [];
    let node: Node | null = target;
    while (node && node !== root) {
        const parent: ParentNode | null = node.parentNode!;
        let idx = 0;
        let child = parent.firstChild;
        while (child && child !== node) { idx++; child = child.nextSibling; }
        path.unshift(idx);
        node = parent;
    }
    return path;
}

/**
 * Resolves a recorded path against a cloned fragment.
 * Uses firstChild/nextSibling iteration which is faster than childNodes[i].
 */
function _resolvePath(root: Node, path: number[]): Node {
    let node: Node = root;
    for (let i = 0; i < path.length; i++) {
        const targetIdx = path[i];
        let current = node.firstChild!;
        for (let j = 0; j < targetIdx; j++) current = current.nextSibling!;
        node = current;
    }
    return node;
}

// =============================================================================
// --- Keyboard modifier map (module-level — not recreated per binding) ---
// =============================================================================

const KEY_MAP: Readonly<Record<string, string>> = {
    enter: "Enter",
    escape: "Escape",
    space: " ",
    tab: "Tab",
    delete: "Delete",
    backspace: "Backspace",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
};

// =============================================================================
// --- Binding activation ---
// =============================================================================

/** Activates all bindings on the cloned fragment. Returns dispose functions. */
function activateBindings(
    fragment: DocumentFragment,
    contexts: BindingContext[],
    values: unknown[],
    pathMap: Array<{ path: number[]; name?: string } | null>,
): { disposes: Array<() => void>; postMountHooks: Array<() => void> } {
    const disposes: Array<() => void> = [];
    const postMountHooks: Array<() => void> = [];

    // FASE 1: LECTURA. 
    const resolvedNodes = new Array<Node | null>(contexts.length);
    for (let i = 0; i < contexts.length; i++) {
        const info = pathMap[i];
        resolvedNodes[i] = info ? _resolvePath(fragment, info.path) : null;
    }

    // FASE 2: MUTACIÓN
    for (let i = 0; i < contexts.length; i++) {
        const ctx = contexts[i];
        const value = values[i];
        const info = pathMap[i];
        if (!info) continue;

        const el = resolvedNodes[i]!;

        // --- Events ---
        if (ctx.type === "event") {
            const eventName = info.name!;
            const rawHandler = value as EventListener;
            const mods = ctx.modifiers;

            const listenerOpts: AddEventListenerOptions = {};
            if (mods.includes("once")) listenerOpts.once = true;
            if (mods.includes("capture")) listenerOpts.capture = true;
            if (mods.includes("passive")) listenerOpts.passive = true;

            const handler: EventListener = (e: Event) => {
                if (mods.includes("prevent")) e.preventDefault();
                if (mods.includes("stop")) e.stopPropagation();
                if (mods.includes("self") && e.target !== e.currentTarget) return;

                if ("key" in e) {
                    const ke = e as KeyboardEvent;
                    for (const mod of mods) {
                        const mapped = KEY_MAP[mod];
                        if (mapped !== undefined && ke.key !== mapped) return;
                        if (!KEY_MAP[mod] && mod.length === 1 && ke.key.toLowerCase() !== mod) return;
                    }
                }
                rawHandler(e);
            };

            el.addEventListener(eventName, handler, listenerOpts);
            disposes.push(() => el.removeEventListener(eventName, handler, listenerOpts));
            continue;
        }

        // --- Attributes ---
        if (ctx.type === "attr") {
            const attrName = info.name!;
            const element = el as Element;

            if (attrName === "ref") {
                (value as NixRef<Element>).el = element;
                disposes.push(() => { (value as NixRef<Element>).el = null; });
                continue;
            }

            if (attrName === "show" || attrName === "hide") {
                const htmlEl = element as HTMLElement;
                let originalDisplay: string | null = null;

                if (typeof value === "function") {
                    const dispose = effect(() => {
                        const visible = Boolean((value as () => unknown)());
                        const shouldShow = attrName === "show" ? visible : !visible;
                        if (originalDisplay === null) {
                            originalDisplay = htmlEl.style.display || "";
                        }
                        htmlEl.style.display = shouldShow ? originalDisplay : "none";
                    });
                    disposes.push(dispose);
                } else {
                    const shouldShow = attrName === "show" ? Boolean(value) : !Boolean(value);
                    if (!shouldShow) htmlEl.style.display = "none";
                }
                continue;
            }

            const isDomProp = (attrName === "value" || attrName === "checked" || attrName === "selected") && attrName in element;

            if (typeof value === "function") {
                const dispose = effect(() => {
                    const v = (value as () => unknown)();
                    if (isDomProp) {
                        (element as any)[attrName] = v ?? "";
                    } else if (v == null || v === false) {
                        element.removeAttribute(attrName);
                    } else {
                        element.setAttribute(attrName, String(v));
                    }
                });
                disposes.push(dispose);
            } else {
                if (isDomProp) {
                    (element as any)[attrName] = value ?? "";
                } else if (value != null && value !== false) {
                    element.setAttribute(attrName, String(value));
                }
            }
            continue;
        }

        // --- Nodes ---
        const anchor = el as Comment;
        if (!anchor) continue;

        if (typeof value !== "function") {
            if (isNixComponent(value)) {
                _mountComponentDeferred(value, anchor.parentNode!, anchor, postMountHooks, disposes);
            } else if (isNixTemplate(value)) {
                const templateCleanup = value._render(anchor.parentNode!, anchor);
                disposes.push(templateCleanup);
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    if (isNixComponent(item)) {
                        _mountComponentDeferred(item, anchor.parentNode!, anchor, postMountHooks, disposes);
                    } else if (isNixTemplate(item)) {
                        item._render(anchor.parentNode!, anchor);
                    } else if (item != null && item !== false) {
                        anchor.parentNode!.insertBefore(
                            document.createTextNode(String(item)),
                            anchor
                        );
                    }
                }
            } else if (value != null && value !== false) {
                anchor.parentNode!.insertBefore(
                    document.createTextNode(String(value)),
                    anchor
                );
            }
            continue;
        }

        let textNode: Text | null = null;
        let innerCleanup: (() => void) | null = null;

        type Key = string | number;
        let keyedState: Map<Key, KEntry> | null = null;
        let keyedZoneStart: Comment | null = null;

        const ctxSnapshot = _captureContextSnapshot();

        const dispose = effect(() => {
            const v = (value as () => unknown)();

            if (typeof v === "string" || typeof v === "number") {
                if (innerCleanup) {
                    innerCleanup();
                    innerCleanup = null;
                }
                if (!textNode) {
                    textNode = document.createTextNode(String(v));
                    anchor.parentNode!.insertBefore(textNode, anchor);
                } else {
                    textNode.nodeValue = String(v);
                }
                return;
            }

            if (textNode) {
                textNode.parentNode?.removeChild(textNode);
                textNode = null;
            }
            if (innerCleanup) {
                innerCleanup();
                innerCleanup = null;
            }

            if (v == null || v === false) {
                // Empty
            } else if (isNixTemplate(v)) {
                innerCleanup = v._render(anchor.parentNode!, anchor);
            } else if (isNixComponent(v)) {
                innerCleanup = _mountComponentWithCtx(v, anchor.parentNode!, anchor, ctxSnapshot);
            } else if (isKeyedList(v)) {

                if (!keyedState) {
                    keyedState = new Map();
                    keyedZoneStart = document.createComment(COMMENT.KEYED_ZONE);
                    anchor.parentNode!.insertBefore(keyedZoneStart, anchor);
                }

                const parent = anchor.parentNode!;
                const newKeyOrder: Key[] = v.items.map(
                    (item, idx) => v.keyFn(item as never, idx)
                );
                const newKeySet = new Set(newKeyOrder);

                let anyKeysSurvive = false;
                if (keyedState.size > 0) {
                    for (const k of keyedState.keys()) {
                        if (newKeySet.has(k)) {
                            anyKeysSurvive = true;
                            break;
                        }
                    }
                }

                // ── 1. Bulking & First render ─────────────────────────────────────
                if (!anyKeysSurvive) {
                    if (keyedState.size > 0) {
                        const range = document.createRange();
                        range.setStartAfter(keyedZoneStart!);
                        range.setEndBefore(anchor);
                        range.deleteContents();
                        for (const entry of keyedState.values()) entry.cleanup();
                        keyedState.clear();
                    }

                    if (newKeyOrder.length > 0) {
                        const frag = document.createDocumentFragment();
                        for (let i = 0; i < newKeyOrder.length; i++) {
                            const key = newKeyOrder[i];
                            const item = v.items[i];
                            const start = document.createComment(COMMENT.KEYED_START);
                            const end = document.createComment(COMMENT.KEYED_END);
                            
                            // 1. Adjuntamos AMBOS marcadores al fragmento primero
                            frag.appendChild(start);
                            frag.appendChild(end);

                            // 2. Pasamos 'end' en lugar de 'null' para que la limpieza no se desborde
                            const rendered = v.renderFn(item as never, i);
                            const cleanup = isNixComponent(rendered)
                                ? _mountComponentWithCtx(rendered, frag, end, ctxSnapshot)
                                : rendered._render(frag, end);

                            // La línea frag.appendChild(end); que tenías aquí abajo se elimina
                            keyedState.set(key, { start, end, cleanup });
                        }
                        parent.insertBefore(frag, anchor);
                    }
                    return;
                }

                // ── 2. Individual removals ───────────────────────────────────────
                for (const [key, entry] of keyedState.entries()) {
                    if (!newKeySet.has(key)) {
                        entry.cleanup(); 
                        // Fix de memoria O(1) pero iterativo en el DOM para evitar fugas
                        let node: Node | null = entry.start;
                        while (node) {
                            const next: ChildNode | null = node === entry.end ? null : node.nextSibling;
                            node.parentNode?.removeChild(node);
                            if (!next) break;
                            node = next;
                        }
                        keyedState.delete(key);
                    }
                }

                // ── 3. Insert/move items ──────────────────────────────────────────
                let insertionPoint: Node = anchor;
                for (let idx = newKeyOrder.length - 1; idx >= 0; idx--) {
                    const key = newKeyOrder[idx];

                    if (keyedState.has(key)) {
                        const entry = keyedState.get(key)!;
                        if (entry.end.nextSibling !== insertionPoint) {
                            // DOM FIX: Usar insertBefore directo
                            let node: Node | null = entry.start;
                            while (node) {
                                const next: ChildNode | null = node === entry.end ? null : node.nextSibling;
                                parent.insertBefore(node, insertionPoint);
                                if (!next) break;
                                node = next;
                            }
                        }
                        insertionPoint = entry.start;
                    } else {
                        let startIdx = idx;
                        while (startIdx > 0 && !keyedState.has(newKeyOrder[startIdx - 1])) {
                            startIdx--;
                        }

                        const frag = document.createDocumentFragment();
                        const newEntries: Array<{ key: Key; start: Comment; end: Comment; cleanup: () => void }> = [];

                        for (let i = startIdx; i <= idx; i++) {
                            const k = newKeyOrder[i];
                            const it = v.items[i];
                            const sMarker = document.createComment(COMMENT.KEYED_START);
                            const eMarker = document.createComment(COMMENT.KEYED_END);
                            
                            // 1. Adjuntamos AMBOS marcadores primero
                            frag.appendChild(sMarker);
                            frag.appendChild(eMarker);

                            // 2. Pasamos 'eMarker' en lugar de 'null'
                            const rendered = v.renderFn(it as never, i);
                            const cleanup = isNixComponent(rendered)
                                ? _mountComponentWithCtx(rendered, frag, eMarker, ctxSnapshot)
                                : rendered._render(frag, eMarker);

                            // La línea frag.appendChild(eMarker); que tenías aquí abajo se elimina
                            newEntries.push({ key: k, start: sMarker, end: eMarker, cleanup });
                        }

                        parent.insertBefore(frag, insertionPoint);
                        for (const e of newEntries) keyedState.set(e.key, e);

                        insertionPoint = newEntries[0].start;
                        idx = startIdx;
                    }
                }
            } else if (Array.isArray(v)) {
                const cleanups: Array<() => void> = [];
                for (const item of v) {
                    if (isNixComponent(item)) {
                        cleanups.push(_mountComponent(item, anchor.parentNode!, anchor));
                    } else if (isNixTemplate(item)) {
                        cleanups.push(item._render(anchor.parentNode!, anchor));
                    } else if (item != null && item !== false) {
                        const t = document.createTextNode(String(item));
                        anchor.parentNode!.insertBefore(t, anchor);
                        cleanups.push(() => t.parentNode?.removeChild(t));
                    }
                }
                innerCleanup = () => cleanups.forEach((c) => c());
            } else {
                textNode = document.createTextNode(String(v));
                anchor.parentNode!.insertBefore(textNode, anchor);
            }
        });

        disposes.push(() => {
            dispose();
            if (innerCleanup) {
                innerCleanup();
                innerCleanup = null;
            }
            if (textNode) {
                textNode.parentNode?.removeChild(textNode);
                textNode = null;
            }
            if (keyedState) {
                for (const entry of keyedState.values()) {
                    entry.cleanup();
                }
                keyedState = null;
                keyedZoneStart = null;
            }
        });
    }

    return { disposes, postMountHooks };
}

// =============================================================================
// --- Template cache ---
// =============================================================================

interface TemplateCache {
    contexts: BindingContext[];
    tpl: HTMLTemplateElement;
    pathMap: Array<{ path: number[]; name?: string } | null>;
}
const _templateCache = new WeakMap<TemplateStringsArray, TemplateCache>();

// =============================================================================
// --- html`` tag function ---
// =============================================================================

export function html(
    strings: TemplateStringsArray,
    ...values: unknown[]
): NixTemplate {
    let cached = _templateCache.get(strings);
    if (!cached) {
        const contexts: BindingContext[] = [];
        let accumulated = "";
        for (let i = 0; i < strings.length - 1; i++) {
            accumulated += strings[i];
            contexts.push(detectContext(accumulated));
            accumulated += "__nix__";
        }
        const tpl = document.createElement("template");
        tpl.innerHTML = buildHTML(strings, contexts);

        // --- Pre-record paths once, on the canonical template content ---
        // After this, every clone resolves markers in O(depth) with no traversal.
        const pathMap = new Array<{ path: number[]; name?: string } | null>(contexts.length).fill(null);
        const root = tpl.content;

        // Walk comments to find nix-N markers
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
        let wNode: Node | null;
        while ((wNode = walker.nextNode())) {
            const c = wNode as Comment;
            const m = c.nodeValue?.match(/^nix-(\d+)$/);
            if (m) {
                const idx = parseInt(m[1]);
                pathMap[idx] = { path: _recordPath(root, c) };
            }
        }

        // Walk elements to find data-nix-e-N / data-nix-a-N markers
        root.querySelectorAll("*").forEach((el) => {
            // snapshot attrs before any mutation
            const attrs = Array.from(el.attributes);
            for (const attr of attrs) {
                let m = attr.name.match(/^data-nix-e-(\d+)$/);
                if (m) {
                    const idx = parseInt(m[1]);
                    pathMap[idx] = {
                        path: _recordPath(root, el),
                        name: attr.value,
                    };
                    el.removeAttribute(attr.name); // Clean source template
                    continue;
                }
                m = attr.name.match(/^data-nix-a-(\d+)$/);
                if (m) {
                    const idx = parseInt(m[1]);
                    pathMap[idx] = {
                        path: _recordPath(root, el),
                        name: attr.value,
                    };
                    el.removeAttribute(attr.name); // Clean source template
                }
            }
        });

        cached = { contexts, tpl, pathMap };
        _templateCache.set(strings, cached);
    }

    const { contexts, tpl, pathMap } = cached;

    function _render(parent: Node, before: Node | null): () => void {
        const fragment = tpl.content.cloneNode(true) as DocumentFragment;

        const { disposes, postMountHooks } = activateBindings(
            fragment, contexts, values, pathMap
        );

        const startMarker = document.createComment(COMMENT.SCOPE);
        parent.insertBefore(startMarker, before);
        parent.insertBefore(fragment, before);

        postMountHooks.forEach((cb) => cb());

        return () => {
            for (let i = disposes.length - 1; i >= 0; i--) {
                disposes[i]();
            }
            let node = startMarker.nextSibling;
            while (node && node !== before) {
                const next = node.nextSibling;
                node.parentNode?.removeChild(node);
                node = next;
            }
            startMarker.parentNode?.removeChild(startMarker);
        };
    }

    const nixTemplate: NixTemplate = {
        __isNixTemplate: true,

        _render,

        mount(container: Element | string): NixMountHandle {
            const el =
                typeof container === "string"
                    ? (document.querySelector(container) as Element)
                    : container;

            if (!el) {
                throw new Error(`[Nix] mount: contenedor no encontrado: ${container}`);
            }

            const cleanup = _render(el, null);

            return {
                unmount() {
                    cleanup();
                },
            };
        },
    };

    return nixTemplate;
}