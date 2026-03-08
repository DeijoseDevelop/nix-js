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

// --- Public types ---

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

// --- portal ---

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
                // Option A: PortalOutlet token — render into the outlet's div
                targetEl = (target as PortalOutlet)._container ?? document.body;
            } else {
                // Option B: NixRef<Element> — portal into the referenced element
                targetEl = (target as NixRef<Element>).el ?? document.body;
            }

            if (isNixComponent(content)) {
                _pushComponentContext();
                let templateCleanup!: () => void;
                try {
                    try { content.onInit?.(); } catch (e) { if (content.onError) content.onError(e); else throw e; }
                    templateCleanup = content.render()._render(targetEl, null);
                } finally {
                    _popComponentContext();
                }
                let mountCleanup: (() => void) | undefined;
                try {
                    const ret = content.onMount?.();
                    if (typeof ret === "function") mountCleanup = ret;
                } catch (e) {
                    if (content.onError) content.onError(e); else throw e;
                }
                return () => {
                    try { content.onUnmount?.(); } catch { /* ignore */ }
                    try { mountCleanup?.(); } catch { /* ignore */ }
                    templateCleanup();
                };
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

// --- Error Boundary ---

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
            const marker = document.createComment("nix-eb");
            parent.insertBefore(marker, before);

            let activeCleanup: (() => void) | null = null;
            let errored = false;
            let initialRenderDone = false;
            let deferredError: unknown = undefined;
            let hasDeferredError = false;

            // Renders the fallback outside the error handler window
            const renderFallback = (err: unknown): void => {
                // Use marker.parentNode instead of the captured `parent`
                // because `parent` may be a stale DocumentFragment when the
                // boundary was rendered inside another template (the fragment
                // was emptied when the outer template moved children to the DOM).
                const liveParent = marker.parentNode!;

                const fb: NixTemplate | NixComponent =
                    typeof fallback === "function" && !isNixComponent(fallback as object)
                        ? (fallback as (err: unknown) => NixTemplate | NixComponent)(err)
                        : (fallback as NixTemplate | NixComponent);

                if (isNixComponent(fb)) {
                    _pushComponentContext();
                    let tmplCleanup!: () => void;
                    try {
                        try { fb.onInit?.(); } catch { /* ignore errors in fallback */ }
                        tmplCleanup = fb.render()._render(liveParent, before);
                    } finally {
                        _popComponentContext();
                    }
                    let mountCleanup: (() => void) | undefined;
                    try {
                        const ret = fb.onMount?.();
                        if (typeof ret === "function") mountCleanup = ret;
                    } catch { /* ignore */ }
                    activeCleanup = () => {
                        try { fb.onUnmount?.(); } catch { /* ignore */ }
                        mountCleanup?.();
                        tmplCleanup();
                    };
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

            // Handle errors detected during initial render.  Now that _render
            // has returned, activeCleanup holds content's cleanup which we can
            // safely invoke to strip the (partially rendered) content from DOM.
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

// --- Transitions ---

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
    return Math.max(0, ...cssValue.split(",").map((s) => parseFloat(s) || 0));
}

function _waitTransitionEnd(el: Element, fallbackMs = 0): Promise<void> {
    return new Promise((resolve) => {
        const st = getComputedStyle(el);
        const ms =
            Math.max(
                _cssMaxDuration(st.transitionDuration || "0"),
                _cssMaxDuration(st.animationDuration || "0"),
            ) * 1000;
        const wait = ms > 0 ? ms + 100 : fallbackMs > 0 ? fallbackMs : 0;

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
            const marker = document.createComment("nix-t");
            parent.insertBefore(marker, before);

            // Currently displayed content cleanup
            let contentCleanup: (() => void) | null = null;
            // Cleanup of content currently being animated OUT (leave phase)
            let leaveCleanup: (() => void) | null = null;
            // Monotone generation counter — incremented on enter to cancel ongoing leave
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

            /** Mount a NixTemplate or NixComponent and return its cleanup. */
            function mountContent(tpl: NixTemplate | NixComponent): () => void {
                if (isNixComponent(tpl)) {
                    const comp = tpl as NixComponent;
                    _pushComponentContext();
                    let rendered!: NixTemplate;
                    try {
                        try { comp.onInit?.(); } catch { /* ignore */ }
                        rendered = comp.render();
                    } finally {
                        _popComponentContext();
                    }
                    const tmplCleanup = rendered._render(parent, before);
                    let mountRet: (() => void) | void;
                    try { mountRet = comp.onMount?.(); } catch { /* ignore */ }
                    return () => {
                        try { comp.onUnmount?.(); } catch { /* ignore */ }
                        if (typeof mountRet === "function") try { mountRet(); } catch { /* ignore */ }
                        tmplCleanup();
                    };
                }
                return (tpl as NixTemplate)._render(parent, before);
            }

            /** Mount content and play enter animation (does NOT block). */
            const doEnter = (tpl: NixTemplate | NixComponent, skipAnim = false): void => {
                // Cancel any in-progress leave
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
                // Reactive conditional: () => Template | null
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
                // The initial effect run (synchronous) counts as the first render,
                // so subsequent null→value transitions should always animate.
                isFirstRender = false;
            } else {
                // Static: mount once
                doEnter(content as NixTemplate | NixComponent);
            }

            return () => {
                leaveGen++;               // cancel any in-progress leave
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

// --- Binding context ---

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

    // Between tags → node context
    if (lastOpen <= lastClose) {
        return { type: "node" };
    }

    const tagContent = prevString.slice(lastOpen + 1);

    // Event: @eventname[.modifier...]=
    const eventMatch = tagContent.match(/@([\w:.-]+)=["']?$/);
    if (eventMatch) {
        const full = eventMatch[1];          // e.g. "click.prevent.stop"
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

    // Attribute: attrname=
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

// --- Static HTML construction with markers ---

/**
 * Builds the static HTML string, replacing each interpolated value with
 * a comment marker (node), data-nix-e-N (event), or data-nix-a-N (attribute).
 */
function buildHTML(
    strings: readonly string[],
    contexts: BindingContext[]
): string {
    const skipLeading = new Array(strings.length).fill(0);
    let result = "";

    for (let i = 0; i < strings.length; i++) {
        let s = strings[i];

        // Skip closing quote left by previous binding
        if (skipLeading[i] === 1 && (s[0] === '"' || s[0] === "'")) {
            s = s.slice(1);
        }

        if (i < contexts.length) {
            const ctx = contexts[i];

            if (ctx.type === "node") {
                result += s + `<!--nix-${i}-->`;
            } else if (ctx.type === "event") {
                // data-nix-e-N stores only the base event name
                const full = ctx.modifiers.length
                    ? `${ctx.eventName}.${ctx.modifiers.join(".")}`
                    : ctx.eventName;
                const cut = `@${full}=`.length + (ctx.hadOpenQuote ? 1 : 0);
                result += s.slice(0, -cut) + ` data-nix-e-${i}="${ctx.eventName}"`;
                if (ctx.hadOpenQuote) skipLeading[i + 1] = 1;
            } else {
                // attr
                const cut =
                    `${ctx.attrName}=`.length + (ctx.hadOpenQuote ? 1 : 0);
                result += s.slice(0, -cut) + ` data-nix-a-${i}="${ctx.attrName}"`;
                if (ctx.hadOpenQuote) skipLeading[i + 1] = 1;
            }
        } else {
            result += s;
        }
    }

    return result;
}

// --- DOM inspection helpers ---

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

/** Walks the subtree and returns a map of index → Comment marker. */
function findCommentMarkers(root: Node): Map<number, Comment> {
    const map = new Map<number, Comment>();
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_COMMENT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
        const c = node as Comment;
        const m = c.nodeValue?.match(/^nix-(\d+)$/);
        if (m) map.set(parseInt(m[1]), c);
    }
    return map;
}

/** Walks the subtree for data-nix-e-N / data-nix-a-N attribute markers. */
function findAttrEventMarkers(
    fragment: DocumentFragment
): Map<number, { el: Element; type: "attr" | "event"; name: string }> {
    const map = new Map<
        number,
        { el: Element; type: "attr" | "event"; name: string }
    >();

    const check = (el: Element) => {
        const attrs = Array.from(el.attributes); // snapshot before mutation
        for (const attr of attrs) {
            let m = attr.name.match(/^data-nix-e-(\d+)$/);
            if (m) {
                map.set(parseInt(m[1]), { el, type: "event", name: attr.value });
                el.removeAttribute(attr.name);
                continue;
            }
            m = attr.name.match(/^data-nix-a-(\d+)$/);
            if (m) {
                map.set(parseInt(m[1]), { el, type: "attr", name: attr.value });
                el.removeAttribute(attr.name);
            }
        }
    };

    fragment.querySelectorAll("*").forEach(check);
    return map;
}

// --- Binding activation ---

/** Activates all bindings on the cloned fragment. Returns dispose functions. */
function activateBindings(
    fragment: DocumentFragment,
    contexts: BindingContext[],
    values: unknown[]
): { disposes: Array<() => void>; postMountHooks: Array<() => void> } {
    const disposes: Array<() => void> = [];
    const postMountHooks: Array<() => void> = [];

    const commentMap = findCommentMarkers(fragment);
    const attrEventMap = findAttrEventMarkers(fragment);

    for (let i = 0; i < contexts.length; i++) {
        const ctx = contexts[i];
        const value = values[i];

        // --- Events ---
        if (ctx.type === "event") {
            const info = attrEventMap.get(i);
            if (!info) continue;
            const { el, name: eventName } = info;
            const rawHandler = value as EventListener;
            const mods = ctx.modifiers;

            // addEventListener options
            const listenerOpts: AddEventListenerOptions = {};
            if (mods.includes("once")) listenerOpts.once = true;
            if (mods.includes("capture")) listenerOpts.capture = true;
            if (mods.includes("passive")) listenerOpts.passive = true;

            // Named key map for keyboard event modifiers
            const KEY_MAP: Record<string, string> = {
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

            const handler: EventListener = (e: Event) => {
                if (mods.includes("prevent")) e.preventDefault();
                if (mods.includes("stop")) e.stopPropagation();
                if (mods.includes("self") && e.target !== e.currentTarget) return;

                // Key filters (only apply when event has `key`)
                if ("key" in e) {
                    const ke = e as KeyboardEvent;
                    for (const mod of mods) {
                        const mapped = KEY_MAP[mod];
                        if (mapped !== undefined && ke.key !== mapped) return;
                        // tecla individual (una letra/dígito)
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
            const info = attrEventMap.get(i);
            if (!info) continue;
            const { el, name: attrName } = info;

            // --- ref attribute ---
            if (attrName === "ref") {
                (value as NixRef<Element>).el = el as Element;
                disposes.push(() => { (value as NixRef<Element>).el = null; });
                continue;
            }

            // --- show / hide attribute ---
            // show=${() => condition}  → hides element when condition is falsy
            // hide=${() => condition}  → hides element when condition is truthy
            if (attrName === "show" || attrName === "hide") {
                const htmlEl = el as HTMLElement;
                // Preserve whatever `display` the element had before we touched it.
                // We read it lazily on the first effect run.
                let originalDisplay: string | null = null;

                if (typeof value === "function") {
                    const dispose = effect(() => {
                        const visible = Boolean((value as () => unknown)());
                        const shouldShow = attrName === "show" ? visible : !visible;
                        if (originalDisplay === null) {
                            // First run: capture current computed display
                            originalDisplay = htmlEl.style.display || "";
                        }
                        htmlEl.style.display = shouldShow ? originalDisplay : "none";
                    });
                    disposes.push(dispose);
                } else {
                    // Static value: apply once immediately
                    const shouldShow = attrName === "show" ? Boolean(value) : !Boolean(value);
                    if (!shouldShow) (el as HTMLElement).style.display = "none";
                }
                continue;
            }

            // Properties like `value` and `checked` must be set as DOM properties
            // (not HTML attributes) so reactive bindings update the live input state.
            const isDomProp = (attrName === "value" || attrName === "checked" || attrName === "selected") && attrName in el;

            if (typeof value === "function") {
                const dispose = effect(() => {
                    const v = (value as () => unknown)();
                    if (isDomProp) {
                        (el as unknown as Record<string, unknown>)[attrName] = v ?? "";
                    } else if (v == null || v === false) {
                        el.removeAttribute(attrName);
                    } else {
                        el.setAttribute(attrName, String(v));
                    }
                });
                disposes.push(dispose);
            } else {
                // Valor estático
                if (isDomProp) {
                    (el as unknown as Record<string, unknown>)[attrName] = value ?? "";
                } else if (value != null && value !== false) {
                    el.setAttribute(attrName, String(value));
                }
            }
            continue;
        }

        // --- Nodes ---
        const anchor = commentMap.get(i);
        if (!anchor) continue;

        // Static value (string/number/NixTemplate/NixComponent)
        if (typeof value !== "function") {
            if (isNixComponent(value)) {
                // Static class component: render + schedule onMount after DOM insertion
                const inst = value;
                _pushComponentContext();
                let innerCleanup!: () => void;
                try {
                    try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
                    innerCleanup = inst.render()._render(anchor.parentNode!, anchor);
                } finally {
                    _popComponentContext();
                }
                let mountCleanup: (() => void) | undefined;
                postMountHooks.push(() => {
                    try {
                        const ret = inst.onMount?.();
                        if (typeof ret === "function") mountCleanup = ret;
                    } catch (e) {
                        if (inst.onError) inst.onError(e);
                        else throw e;
                    }
                });
                disposes.push(() => {
                    try { inst.onUnmount?.(); } catch { /* ignore */ }
                    try { mountCleanup?.(); } catch { /* ignore */ }
                    innerCleanup();
                });
            } else if (isNixTemplate(value)) {
                // Static nested template
                const templateCleanup = value._render(anchor.parentNode!, anchor);
                disposes.push(templateCleanup);
            } else if (Array.isArray(value)) {
                for (const item of value) {
                    if (isNixComponent(item)) {
                        let innerCleanupItem!: () => void;
                        _pushComponentContext();
                        try {
                            try { item.onInit?.(); } catch (e) { if (item.onError) item.onError(e); else throw e; }
                            innerCleanupItem = item.render()._render(anchor.parentNode!, anchor);
                        } finally {
                            _popComponentContext();
                        }
                        let mountCleanupItem: (() => void) | undefined;
                        postMountHooks.push(() => {
                            try {
                                const ret = item.onMount?.();
                                if (typeof ret === "function") mountCleanupItem = ret;
                            } catch (e) {
                                if (item.onError) item.onError(e);
                                else throw e;
                            }
                        });
                        disposes.push(() => {
                            try { item.onUnmount?.(); } catch { /* ignore */ }
                            try { mountCleanupItem?.(); } catch { /* ignore */ }
                            innerCleanupItem();
                        });
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

        // Dynamic value (function)
        let textNode: Text | null = null;
        let innerCleanup: (() => void) | null = null;

        // Keyed list diffing state
        type Key = string | number;
        interface KEntry {
            start: Comment;
            end: Comment;
            cleanup: () => void;
        }
        let keyedState: Map<Key, KEntry> | null = null;

        // Capture the provide/inject context snapshot so dynamic components
        // rendered later still see ancestor-provided values.
        const ctxSnapshot = _captureContextSnapshot();

        const dispose = effect(() => {
            const v = (value as () => unknown)();

            // Simple reactive text
            if (typeof v === "string" || typeof v === "number") {
                // Clear any previous template
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

            // For other types, always rebuild
            if (textNode) {
                textNode.parentNode?.removeChild(textNode);
                textNode = null;
            }
            if (innerCleanup) {
                innerCleanup();
                innerCleanup = null;
            }

            if (v == null || v === false) {
                // Nothing to render
            } else if (isNixTemplate(v)) {
                // Conditional: active template
                innerCleanup = v._render(anchor.parentNode!, anchor);
            } else if (isNixComponent(v)) {
                // Dynamic NixComponent (conditional)
                const inst = v;
                let templateCleanup!: () => void;
                _withComponentContext(ctxSnapshot, () => {
                    try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
                    templateCleanup = inst.render()._render(anchor.parentNode!, anchor);
                });
                let mountCleanup: (() => void) | undefined;
                try {
                    const ret = inst.onMount?.();
                    if (typeof ret === "function") mountCleanup = ret;
                } catch (e) {
                    if (inst.onError) inst.onError(e);
                    else throw e;
                }
                innerCleanup = () => {
                    try { inst.onUnmount?.(); } catch { /* ignore */ }
                    try { mountCleanup?.(); } catch { /* ignore */ }
                    templateCleanup();
                };
            } else if (isKeyedList(v)) {
                // Keyed list (repeat()) diffing
                if (!keyedState) keyedState = new Map();
                const parent = anchor.parentNode!;
                const newKeyOrder: Key[] = v.items.map(
                    (item, i) => v.keyFn(item as never, i)
                );
                const newKeySet = new Set(newKeyOrder);

                // 1. Remove entries no longer in the new list
                for (const [key, entry] of keyedState) {
                    if (!newKeySet.has(key)) {
                        entry.cleanup();
                        let node: Node = entry.start;
                        while (node !== entry.end) {
                            const next = node.nextSibling!;
                            parent.removeChild(node);
                            node = next;
                        }
                        parent.removeChild(entry.end);
                        keyedState.delete(key);
                    }
                }

                // 2. Insert/move items in reverse order using insertBefore
                //    with an insertionPoint advancing leftward.
                let insertionPoint: Node = anchor;
                for (let idx = newKeyOrder.length - 1; idx >= 0; idx--) {
                    const key = newKeyOrder[idx];
                    const item = v.items[idx];

                    if (keyedState.has(key)) {
                        // Existing item — move only if not already in position
                        const entry = keyedState.get(key)!;
                        if (entry.end.nextSibling !== insertionPoint) {
                            // Collect item nodes (start … end inclusive) and move them
                            const nodesToMove: Node[] = [];
                            let node: Node = entry.start;
                            while (true) {
                                nodesToMove.push(node);
                                if (node === entry.end) break;
                                node = node.nextSibling!;
                            }
                            for (const n of nodesToMove) {
                                parent.insertBefore(n, insertionPoint);
                            }
                        }
                        insertionPoint = entry.start;
                    } else {
                        // New item — render and register
                        const endMarker = document.createComment("nix-ke");
                        const startMarker = document.createComment("nix-ks");
                        parent.insertBefore(endMarker, insertionPoint);
                        parent.insertBefore(startMarker, endMarker);

                        let itemCleanup: () => void;
                        const rendered = v.renderFn(item as never, idx);
                        if (isNixComponent(rendered)) {
                            let tmplCleanup!: () => void;
                            _withComponentContext(ctxSnapshot, () => {
                                try { rendered.onInit?.(); } catch (e) { if (rendered.onError) rendered.onError(e); else throw e; }
                                tmplCleanup = rendered.render()._render(parent, endMarker);
                            });
                            let mountCleanup: (() => void) | undefined;
                            try {
                                const ret = rendered.onMount?.();
                                if (typeof ret === "function") mountCleanup = ret;
                            } catch (e) {
                                if (rendered.onError) rendered.onError(e); else throw e;
                            }
                            itemCleanup = () => {
                                try { rendered.onUnmount?.(); } catch { /* ignore */ }
                                try { mountCleanup?.(); } catch { /* ignore */ }
                                tmplCleanup();
                            };
                        } else {
                            itemCleanup = rendered._render(parent, endMarker);
                        }

                        keyedState.set(key, { start: startMarker, end: endMarker, cleanup: itemCleanup });
                        insertionPoint = startMarker;
                    }
                }
            } else if (Array.isArray(v)) {
                // Lista sin keys — renderizar cada elemento (re-render completo)
                const cleanups: Array<() => void> = [];
                for (const item of v) {
                    if (isNixComponent(item)) {
                        try { item.onInit?.(); } catch (e) { if (item.onError) item.onError(e); else throw e; }
                        const templateCleanup = item.render()._render(anchor.parentNode!, anchor);
                        let mountCleanup: (() => void) | undefined;
                        try {
                            const ret = item.onMount?.();
                            if (typeof ret === "function") mountCleanup = ret;
                        } catch (e) {
                            if (item.onError) item.onError(e);
                            else throw e;
                        }
                        cleanups.push(() => {
                            try { item.onUnmount?.(); } catch { /* ignore */ }
                            try { mountCleanup?.(); } catch { /* ignore */ }
                            templateCleanup();
                        });
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
                // Primitivo embuelto en función (primera vez o tipo cambiado)
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
            }
        });
    }

    return { disposes, postMountHooks };
}

// --- html`` tag function ---

export function html(
    strings: TemplateStringsArray,
    ...values: unknown[]
): NixTemplate {
    // Build binding contexts using an accumulated string so multiple bindings
    // within the same tag (e.g. id="${x}" @click=${fn}) are correctly detected.
    const contexts: BindingContext[] = [];
    let accumulated = "";
    for (let i = 0; i < strings.length - 1; i++) {
        accumulated += strings[i];
        const ctx = detectContext(accumulated);
        contexts.push(ctx);
        accumulated += "__nix__";
    }

    const rawHTML = buildHTML(strings, contexts);

    function _render(parent: Node, before: Node | null): () => void {
        const tpl = document.createElement("template");
        tpl.innerHTML = rawHTML;
        const fragment = tpl.content;

        const { disposes, postMountHooks } = activateBindings(fragment, contexts, values);

        const startMarker = document.createComment("nix-scope");
        parent.insertBefore(startMarker, before);

        let child = fragment.firstChild;
        while (child) {
            const next = child.nextSibling;
            parent.insertBefore(child, before);
            child = next;
        }

        // Lifecycle: fire onMount after DOM insertion
        postMountHooks.forEach((cb) => cb());

        return () => {
            disposes.forEach((d) => d());
            // Remove all nodes between startMarker and before
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
