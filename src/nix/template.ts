// ═══════════════════════════════════════════════
//  Nix.js ❄️ — Template Engine  (Fase 2)
// ═══════════════════════════════════════════════
//
//  html`<p>Hola ${() => name.value}</p>`
//  → NixTemplate { mount(el), _render(parent, before) }
//
//  Tipos de binding:
//    1. texto estático   →  string / number directo
//    2. texto reactivo   →  () => primitivo
//    3. evento           →  @event=${handler}
//    4. atributo         →  attr=${fn | valor}
//    5. template anidado →  html`` directo
//    6. condicional      →  () => html`` | null
//    7. lista            →  () => html``[]

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

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface NixTemplate {
    readonly __isNixTemplate: true;
    /** Monta el template en un contenedor (uso externo / raíz). */
    mount(container: Element | string): NixMountHandle;
    /**
     * @internal — Renderiza el template antes del nodo `before` (o al final
     * de `parent` si `before` es null).  Retorna una función de limpieza.
     */
    _render(parent: Node, before: Node | null): () => void;
}

export interface NixMountHandle {
    unmount(): void;
}

/**
 * Contenedor para una referencia directa a un elemento DOM.
 * Se asigna automáticamente cuando el template se monta y se limpia al
 * desmontarse.
 *
 * @example
 * const inputRef = ref<HTMLInputElement>();
 * html`<input ref=${inputRef} />`
 * // después del mount:
 * inputRef.el?.focus();
 */
export interface NixRef<T extends Element = Element> {
    el: T | null;
}

/**
 * Crea un objeto `NixRef` vacío.
 * Pásalo como valor del atributo especial `ref` en un template para que
 * Nix.js rellene automáticamente `ref.el` con el elemento real del DOM.
 */
export function ref<T extends Element = Element>(): NixRef<T> {
    return { el: null };
}

// ─── show / hide directive ────────────────────────────────────────────────────

/**
 * Toggles the visibility of an element **without unmounting it** from the DOM
 * (sets `style.display = "none"` when hidden, restores it when visible).
 *
 * Use the `show` or `hide` attribute bindings inside templates — or call
 * this helper directly for imperative use outside of templates.
 *
 * ### Template usage
 * ```html
 * <!-- show: element is visible when condition is truthy -->
 * <div show=${() => isVisible.value}>...</div>
 *
 * <!-- hide: element is hidden when condition is truthy (inverse of show) -->
 * <div hide=${() => isLoading.value}>Submit</div>
 * ```
 *
 * ### Difference from conditional rendering
 * | | `show` / `hide` | conditional (`() => condition ? html\`…\` : null`) |
 * |---|---|---|
 * | DOM node kept | ✅ always | ❌ destroyed when hidden |
 * | Lifecycle hooks | not called on toggle | called on every toggle |
 * | Use when | hiding/showing frequently | rarely shown alternatives |
 *
 * ### Imperative usage (outside a template)
 * ```typescript
 * import { showWhen } from "@deijose/nix-js";
 * import { effect } from "@deijose/nix-js";
 *
 * const el = document.getElementById("my-panel")!;
 * // Reactively controlled:
 * effect(() => showWhen(el, isVisible.value));
 * ```
 */
export function showWhen(el: HTMLElement, condition: boolean): void {
    if (!condition) {
        if (el.style.display !== "none") el.style.display = "none";
    } else {
        if (el.style.display === "none") el.style.display = "";
    }
}

/**
 * Resultado de `repeat()` — lista con keys para diffing eficiente.
 * El template engine lo reconoce y solo añade/mueve/elimina los nodos
 * que realmente cambiaron, preservando el DOM de los items estables.
 */
export interface KeyedList<T = unknown> {
    readonly __isKeyedList: true;
    readonly items: T[];
    readonly keyFn: (item: T, index: number) => string | number;
    readonly renderFn: (item: T, index: number) => NixTemplate | NixComponent;
}

/**
 * Crea una lista con keys para diffing eficiente.
 * Úsalo en lugar de `.map()` cuando la lista cambia frecuentemente.
 *
 * @param items    Array reactivo de datos
 * @param keyFn    Devuelve una clave única por item (p.ej. `item => item.id`)
 * @param renderFn Devuelve el template/componente para cada item
 *
 * @example
 * ${() => repeat(
 *   users.value,
 *   u => u.id,
 *   u => html`<li>${u.name}</li>`
 * )}
 */
export function repeat<T>(
    items: T[],
    keyFn: (item: T, index: number) => string | number,
    renderFn: (item: T, index: number) => NixTemplate | NixComponent
): KeyedList<T> {
    return { __isKeyedList: true as const, items, keyFn, renderFn };
}

// ─── portal() ─────────────────────────────────────────────────────────────────

/**
 * Renders `content` into `target` instead of the current position in the tree.
 * The portal is cleaned up automatically when the parent template is unmounted.
 *
 * Use this to render modals, tooltips, notifications, or dropdowns outside of
 * your component tree — typically into `document.body` — so they are not clipped
 * by `overflow: hidden` or buried under other stacking contexts.
 *
 * The portal returns a `NixTemplate`, so it works as a node value anywhere in
 * a template, including inside reactive conditionals: the portal is
 * mounted/unmounted together with whatever controls its condition.
 *
 * @param content  Template or component to render inside the portal.
 * @param target   CSS selector or `Element` to render into. Defaults to `document.body`.
 *
 * @example Reactive modal
 * ```typescript
 * import { signal, portal, html } from "@deijose/nix-js";
 *
 * const isOpen = signal(false);
 *
 * html`
 *   <button @click=${() => { isOpen.value = true; }}>Open</button>
 *
 *   ${() => isOpen.value
 *     ? portal(html`
 *         <div class="overlay" @click=${() => { isOpen.value = false; }}>
 *           <div class="modal" @click.stop=${() => {}}>
 *             <h2>Hello from a portal!</h2>
 *             <button @click=${() => { isOpen.value = false; }}>Close</button>
 *           </div>
 *         </div>
 *       `)
 *     : null
 *   }
 * `
 * ```
 *
 * @example Custom target
 * ```typescript
 * portal(html`<div class="toast">Saved!</div>`, "#toast-root")
 * portal(html`<Tooltip />`, document.getElementById("tooltip-layer")!)
 * ```
 */
// ─── PortalOutlet ────────────────────────────────────────────────────────────

/**
 * Opaque token created by `createPortalOutlet()`.
 *
 * Pass it to `portalOutlet()` to declare the DOM anchor where portals targeting
 * this outlet will render, and to `portal(content, outlet)` as the target.
 *
 * @see createPortalOutlet
 * @see portalOutlet
 */
export interface PortalOutlet {
    readonly __isPortalOutlet: true;
    /** @internal — resolved DOM container; set when `portalOutlet()` is mounted */
    _container: Element | null;
}

/**
 * Creates a `PortalOutlet` token — a lightweight, typed anchor point that
 * decouples *where* a portal renders from direct DOM access.
 * No CSS selectors, no `document.querySelector`, no manual element references.
 *
 * ### Workflow
 * 1. Create the token at module or component scope.
 * 2. Place `${portalOutlet(outlet)}` in your layout template to declare the anchor.
 * 3. From any child: `portal(content, outlet)` renders into that anchor.
 *
 * @example
 * ```typescript
 * const modalOutlet = createPortalOutlet();
 *
 * // Layout:
 * html`
 *   <main>${mainContent}</main>
 *   ${portalOutlet(modalOutlet)}
 * `
 *
 * // Child (any depth):
 * html`${() => show.value ? portal(html\`<Modal />\`, modalOutlet) : null}`
 * ```
 */
export function createPortalOutlet(): PortalOutlet {
    return { __isPortalOutlet: true as const, _container: null };
}

/**
 * Declares the DOM anchor for a `PortalOutlet` inside a template.
 * Creates a `<div data-nix-outlet>` at this position; portals targeting
 * `outlet` will render their content as children of that div.
 *
 * The anchor's lifecycle follows its parent template — when the parent
 * unmounts, the outlet div and any portals inside it are cleaned up.
 *
 * @example
 * ```typescript
 * mount(html`
 *   <div class="app">
 *     <main>${mainContent}</main>
 *     ${portalOutlet(modalOutlet)}
 *   </div>
 * `, document.body);
 * ```
 */
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

// ─── Portal outlet — provide / inject shortcut (Option C) ────────────────────

const _OUTLET_KEY = createInjectionKey<PortalOutlet>("nix:portal-outlet");

/**
 * Provides a `PortalOutlet` to descendant components via the inject system.
 * Must be called inside `onInit()` of a `NixComponent`.
 *
 * Eliminates prop drilling: any descendant can call `injectOutlet()` to
 * obtain the outlet without it being passed through every layer.
 *
 * @example
 * ```typescript
 * class AppLayout extends NixComponent {
 *   private outlet = createPortalOutlet();
 *   onInit() { provideOutlet(this.outlet); }
 *   render() {
 *     return html`
 *       <main>...</main>
 *       ${portalOutlet(this.outlet)}
 *     `;
 *   }
 * }
 * ```
 */
export function provideOutlet(outlet: PortalOutlet): void {
    provide(_OUTLET_KEY, outlet);
}

/**
 * Injects the nearest `PortalOutlet` provided by an ancestor component.
 * Returns `undefined` if no ancestor has called `provideOutlet()`.
 *
 * Use `portal(content, injectOutlet())` to render into the ancestor's outlet
 * with no CSS selectors, no `document.querySelector`, and no prop drilling.
 *
 * @example
 * ```typescript
 * class ToastButton extends NixComponent {
 *   private outlet: PortalOutlet | undefined;
 *   private active  = signal(false);
 *   onInit() { this.outlet = injectOutlet(); }
 *   render() {
 *     return html`
 *       <button @click=${() => { this.active.value = true; }}>Notify</button>
 *       ${() => this.active.value
 *         ? portal(html\`<div class="toast">Done!</div>\`, this.outlet)
 *         : null
 *       }
 *     `;
 *   }
 * }
 * ```
 */
export function injectOutlet(): PortalOutlet | undefined {
    return inject(_OUTLET_KEY);
}

// ─── Error Boundary ─────────────────────────────────────────────────────────────────

/**
 * Fallback value for `createErrorBoundary()`:
 * - A static `NixTemplate` or `NixComponent` — always render this on error.
 * - A function `(err) => NixTemplate | NixComponent` — render based on the error.
 */
export type ErrorFallback =
    | NixTemplate
    | NixComponent
    | ((err: unknown) => NixTemplate | NixComponent);

/**
 * Wraps `content` in an error boundary. If any error is thrown during the
 * **initial render** or during a **reactive update** inside `content`, the
 * boundary automatically:
 * 1. Tears down the broken subtree (effects, event listeners, DOM).
 * 2. Renders `fallback` in its place — without crashing the rest of the app.
 *
 * Errors caught:
 * - `onInit()` / `render()` throws in any `NixComponent` inside `content`
 * - Throws inside `html\`\`` binding expressions during initial render
 * - Reactive re-renders: effects created inside `content` that throw when
 *   a signal changes
 *
 * Not caught (same as React):
 * - Event handler throws (wrap those with your own try/catch)
 * - Async code (Promises, `setTimeout`, etc.)
 * - Errors thrown inside `fallback` itself (propagate to the parent boundary)
 *
 * @example Basic usage
 * ```typescript
 * import { createErrorBoundary, html, signal } from "@deijose/nix-js";
 *
 * mount(
 *   createErrorBoundary(
 *     new MyWidget(),
 *     (err) => html`<div class="error">Widget failed: ${String(err)}</div>`
 *   ),
 *   "#app"
 * );
 * ```
 *
 * @example Static fallback
 * ```typescript
 * createErrorBoundary(
 *   html`${() => riskyValue.value}`,
 *   html`<p>Something went wrong.</p>`
 * )
 * ```
 *
 * @example Nested boundaries (inner catches first)
 * ```typescript
 * createErrorBoundary(
 *   html`
 *     <header>...</header>
 *     ${createErrorBoundary(new RiskyWidget(), html`<p>Widget error</p>`)}
 *   `,
 *   html`<p>App-level error</p>`
 * )
 * ```
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

            // ── Render content inside the error boundary window ──────────────
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

// ─── Transitions ─────────────────────────────────────────────────────────────

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

// ── Internal transition helpers ──────────────────────────────────────────────

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

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Wraps `content` with CSS class-based enter / leave transitions.
 *
 * **Static content** (NixTemplate / NixComponent): plays the enter transition
 * on mount (only if `appear: true`; otherwise instant), and cleans up
 * immediately on unmount without a leave transition.
 *
 * **Reactive conditional** `() => Template | null`: plays the enter
 * transition when the expression goes from `null` → value, and the leave
 * transition when it goes from value → `null`.  An in-progress leave is
 * cancelled and the DOM is removed synchronously when new content enters.
 *
 * @example
 * ```css
 * .fade-enter-active, .fade-leave-active { transition: opacity 0.3s ease; }
 * .fade-enter-from,   .fade-leave-to     { opacity: 0; }
 * ```
 * ```typescript
 * const show = signal(true);
 *
 * // Reactive — full enter + leave
 * transition(() => show.value ? html`<p>Hello</p>` : null, { name: "fade" })
 *
 * // Static — only enter (if appear: true)
 * transition(html`<span>Always here</span>`, { name: "slide", appear: true })
 * ```
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
                // ── Reactive conditional: () => Template | null ──────────────
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
                // ── Static: mount once ───────────────────────────────────────
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

// ─── Contexto de binding ──────────────────────────────────────────────────────

type BindingContext =
    | { type: "node" }
    | { type: "event"; eventName: string; modifiers: string[]; hadOpenQuote: boolean }
    | { type: "attr"; attrName: string; hadOpenQuote: boolean };

/**
 * Examina el string que PRECEDE a un valor interpolado y determina
 * el contexto en que aparece: nodo, evento o atributo.
 *
 *   "<p>"            → node
 *   "<button @click="  → event  (hadOpenQuote = true)
 *   "<div class="    → attr   (hadOpenQuote = true)
 *   "<div class=     → attr   (hadOpenQuote = false)
 *
 * ⚠️  LIMITACIÓN — Interpolación parcial de atributos NO soportada:
 *
 *   ✅  html`<div class="${cls}">` ← el valor completo es una interpolación
 *   ❌  html`<div class="prefix-${cls}">` ← literal + interpolación mezclados
 *
 *   En el segundo caso, detectContext ve el string previo terminando en
 *   `class="prefix-` y no puede identificar que la interpolación es PARTE
 *   del valor — la regex del atributo no matchea por el literal intermedio.
 *   Solución: calcular siempre el string completo fuera del template:
 *
 *     const cls = `prefix-${dynamic}`;
 *     html`<div class="${cls}">`
 */
function detectContext(prevString: string): BindingContext {
    const lastClose = prevString.lastIndexOf(">");
    const lastOpen = prevString.lastIndexOf("<");

    if (lastOpen <= lastClose) {
        // Estamos entre tags → contexto de nodo
        return { type: "node" };
    }

    // Estamos dentro de la definición de un tag
    const tagContent = prevString.slice(lastOpen + 1);

    // Evento: @eventname[.modifier...]=  / @eventname[.modifier...]="  / '
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

    // Atributo: attrname=  / attrname="  / attrname='
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

// ─── Construcción del HTML con marcadores ─────────────────────────────────────

/**
 * Construye el string HTML estático reemplazando cada valor interpolado con:
 *  - nodo:   <!--nix-N-->
 *  - evento: atributo data-nix-e-N="eventname"
 *  - attr:   atributo data-nix-a-N="attrname"
 *
 * Para eventos/attrs, también elimina las comillas de apertura del string
 * anterior y marca el string siguiente para omitir la comilla de cierre.
 */
function buildHTML(
    strings: readonly string[],
    contexts: BindingContext[]
): string {
    const skipLeading = new Array(strings.length).fill(0);
    let result = "";

    for (let i = 0; i < strings.length; i++) {
        let s = strings[i];

        // Omitir la comilla de cierre que dejó el binding anterior
        if (skipLeading[i] === 1 && (s[0] === '"' || s[0] === "'")) {
            s = s.slice(1);
        }

        if (i < contexts.length) {
            const ctx = contexts[i];

            if (ctx.type === "node") {
                result += s + `<!--nix-${i}-->`;
            } else if (ctx.type === "event") {
                // data-nix-e-N almacena solo el nombre base del evento
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

// ─── Helpers de inspección del DOM ───────────────────────────────────────────

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

/** Recorre el subárbol y devuelve un mapa de índice → Comment marcador. */
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

/** Recorre el subárbol buscando atributos data-nix-e-N / data-nix-a-N. */
function findAttrEventMarkers(
    fragment: DocumentFragment
): Map<number, { el: Element; type: "attr" | "event"; name: string }> {
    const map = new Map<
        number,
        { el: Element; type: "attr" | "event"; name: string }
    >();

    const check = (el: Element) => {
        const attrs = Array.from(el.attributes); // snapshot antes de mutar
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

// ─── Activación de bindings ───────────────────────────────────────────────────

/**
 * Activa todos los bindings del fragmento clonado.
 * Devuelve un array de funciones dispose para limpiar al desmontar.
 */
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

        // ── EVENTOS ──────────────────────────────────────────────
        if (ctx.type === "event") {
            const info = attrEventMap.get(i);
            if (!info) continue;
            const { el, name: eventName } = info;
            const rawHandler = value as EventListener;
            const mods = ctx.modifiers;

            // Opciones para addEventListener
            const listenerOpts: AddEventListenerOptions = {};
            if (mods.includes("once")) listenerOpts.once = true;
            if (mods.includes("capture")) listenerOpts.capture = true;
            if (mods.includes("passive")) listenerOpts.passive = true;

            // Mapa de teclas con nombre
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

                // Filtros de tecla (solo aplican cuando el evento tiene `key`)
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

        // ── ATRIBUTOS ─────────────────────────────────────────────
        if (ctx.type === "attr") {
            const info = attrEventMap.get(i);
            if (!info) continue;
            const { el, name: attrName } = info;

            // ── REF especial ──────────────────────────────────────────────
            if (attrName === "ref") {
                (value as NixRef<Element>).el = el as Element;
                disposes.push(() => { (value as NixRef<Element>).el = null; });
                continue;
            }

            // ── SHOW / HIDE — toggle visibility without unmounting the DOM ─────
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

        // ── NODO ──────────────────────────────────────────────────
        const anchor = commentMap.get(i);
        if (!anchor) continue;

        // Valor completamente estático (string/number/NixTemplate/NixComponent directo)
        if (typeof value !== "function") {
            if (isNixComponent(value)) {
                // Componente clase estático: render + programar onMount tras inserción en DOM
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
                // Template anidado estático: insertar directamente
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

        // Valor dinámico (función)
        // Usamos el anchor como "end marker". El contenido se inserta antes de él.
        // Para texto reactivo simple, reutilizamos un TextNode.
        let textNode: Text | null = null;
        // Para templates/condicionales/listas guardamos el cleanup del contenido anterior
        let innerCleanup: (() => void) | null = null;

        // ── Estado para repeat() keyed diffing ──────────────────────────────
        type Key = string | number;
        interface KEntry {
            start: Comment;
            end: Comment;
            cleanup: () => void;
        }
        let keyedState: Map<Key, KEntry> | null = null;

        // Capturar el contexto provide/inject vigente en este punto del árbol,
        // para que los componentes dinámicos (reactivos) vean los valores
        // provistos por sus ancestros incluso al re-renderizar.
        const ctxSnapshot = _captureContextSnapshot();

        const dispose = effect(() => {
            const v = (value as () => unknown)();

            // ── Texto reactivo simple ──
            if (typeof v === "string" || typeof v === "number") {
                // Limpiamos cualquier template previo si hubiera
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

            // Para otros tipos, siempre reconstruimos
            if (textNode) {
                textNode.parentNode?.removeChild(textNode);
                textNode = null;
            }
            if (innerCleanup) {
                innerCleanup();
                innerCleanup = null;
            }

            if (v == null || v === false) {
                // Nada que renderizar
            } else if (isNixTemplate(v)) {
                // Condicional: template activo
                innerCleanup = v._render(anchor.parentNode!, anchor);
            } else if (isNixComponent(v)) {
                // NixComponent dinámico (condicional de clase)
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
                // ── Keyed list (repeat()) ── diffing eficiente con keys ──────
                if (!keyedState) keyedState = new Map();
                const parent = anchor.parentNode!;
                const newKeyOrder: Key[] = v.items.map(
                    (item, i) => v.keyFn(item as never, i)
                );
                const newKeySet = new Set(newKeyOrder);

                // 1. Eliminar entries que ya no están en la nueva lista
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

                // 2. Insertar/mover items en orden inverso para poder usar
                //    insertBefore con un insertionPoint que avanza hacia la izquierda.
                let insertionPoint: Node = anchor;
                for (let idx = newKeyOrder.length - 1; idx >= 0; idx--) {
                    const key = newKeyOrder[idx];
                    const item = v.items[idx];

                    if (keyedState.has(key)) {
                        // Item existente — mover solo si no está ya en posición
                        const entry = keyedState.get(key)!;
                        if (entry.end.nextSibling !== insertionPoint) {
                            // Recolectar nodos del item (start … end inclusive) y moverlos
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
                        // Item nuevo — renderizar y registrar
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

// ─── Función principal html`` ─────────────────────────────────────────────────

export function html(
    strings: TemplateStringsArray,
    ...values: unknown[]
): NixTemplate {
    // 1. Determinar el contexto de cada valor
    //
    // ⚠️  Usamos una cadena ACUMULADA en lugar de solo strings[i], porque
    //    cuando hay múltiples bindings en el MISMO tag (e.g. id="${x}" @click=${fn}),
    //    el string entre ellos es `" @click=` — sin ningún `<` ni `>` — y
    //    detectContext lo clasificaría erróneamente como "node".
    //    Al acumular todos los strings anteriores conservamos la información
    //    de que seguimos dentro de un tag abierto.
    const contexts: BindingContext[] = [];
    let accumulated = "";
    for (let i = 0; i < strings.length - 1; i++) {
        accumulated += strings[i];
        const ctx = detectContext(accumulated);
        contexts.push(ctx);
        // Avanzar el acumulado más allá del valor interpolado para que la
        // siguiente iteración sepa si seguimos dentro del mismo tag.
        // Usamos un placeholder neutro que no contiene `<` ni `>`.
        accumulated += "__nix__";
    }

    // 2. Construir el HTML estático con marcadores
    const rawHTML = buildHTML(strings, contexts);

    // ── Función interna de renderizado ────────────────────────────────────────
    function _render(parent: Node, before: Node | null): () => void {
        // 3. Parsear el HTML a un DocumentFragment
        const tpl = document.createElement("template");
        tpl.innerHTML = rawHTML;
        const fragment = tpl.content;

        // 4. Activar bindings (ANTES de insertar, para conservar referencias)
        const { disposes, postMountHooks } = activateBindings(fragment, contexts, values);

        // 5. Insertar el fragmento en el DOM
        //    El fragmento queda vacío después, pero los nodos ya están en el DOM
        //    y los disposes siguen apuntando a ellos correctamente.

        // Insertamos un "start marker" que nos permite limpiar luego
        const startMarker = document.createComment("nix-scope");
        parent.insertBefore(startMarker, before);

        // Mover todos los nodos del fragmento antes de `before`
        let child = fragment.firstChild;
        while (child) {
            const next = child.nextSibling;
            parent.insertBefore(child, before);
            child = next;
        }

        // ── Lifecycle: onMount de NixComponents embebidos ──────────────────────
        // Se dispara DESPUÉS de la inserción para que el DOM esté presente.
        postMountHooks.forEach((cb) => cb());

        // 6. Retornar función de limpieza
        return () => {
            // Destruir effects, listeners y NixComponents anidados.
            // Los onUnmount de NixComponents embebidos están dentro de disposes.
            disposes.forEach((d) => d());

            // Remover todos los nodos entre startMarker y before
            let node = startMarker.nextSibling;
            while (node && node !== before) {
                const next = node.nextSibling;
                node.parentNode?.removeChild(node);
                node = next;
            }
            startMarker.parentNode?.removeChild(startMarker);
        };
    }

    // ── API pública ────────────────────────────────────────────────────────────
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
