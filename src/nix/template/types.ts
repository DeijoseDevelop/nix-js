// =============================================================================
// --- Public types ---
// =============================================================================

export type TemplateBindingContext =
    | { type: "node" }
    | { type: "event"; eventName: string; modifiers: string[]; hadOpenQuote: boolean }
    | { type: "attr"; attrName: string; hadOpenQuote: boolean; url?: boolean; executable?: boolean };

export interface TemplateDescriptor {
    readonly version: 1;
    readonly strings: readonly string[];
    readonly values: readonly unknown[];
    readonly contexts: readonly TemplateBindingContext[];
}

export interface ServerRenderProtocolContext {
    readonly markers: boolean;
    readonly signal?: AbortSignal;
    readonly context?: unknown;
    render(value: unknown, options?: { markers?: boolean }): Promise<string>;
}

/** Context passed to a custom value's `mountDom` protocol during client-side mount. */
export interface DomProtocolContext {
    readonly parent: Node;
    readonly before: Node | null;
    readonly context?: unknown;
}

/** Context passed to a custom value's `hydrateDom` protocol during hydration. */
export interface HydrationProtocolContext {
    readonly parent: Node;
    readonly bounds: { start: Comment; end: Comment } | null;
    readonly context?: unknown;
    /** Remounts a value inside the current bounds (used as fallback). */
    render(value: unknown): unknown;
}

export interface NixRenderProtocol {
    renderServer?(context: ServerRenderProtocolContext): string | Promise<string>;
    mountDom?(context: DomProtocolContext): (() => void) | void;
    hydrateDom?(context: HydrationProtocolContext): (() => void) | void;
}

export const NIX_TEMPLATE_DESCRIPTOR = Symbol.for("@deijose/nix-js/template-descriptor");
export const NIX_RENDER_PROTOCOL = Symbol.for("@deijose/nix-js/render-protocol");

/**
 * Runtime feature capabilities, for tooling to detect support without
 * inferring it from version strings.
 *
 * NOTE: Partial attribute interpolation is now handled at compile time by
 * @deijose/vite-plugin-nix-js. The core runtime does not support it natively.
 * Use the Vite plugin for partial interpolation support.
 */
export const templateFeatures = {
    /** Partial attribute interpolation (`class="btn ${size}"`) is supported. */
    partialAttributeInterpolation: false,
} as const;

export interface NixTemplate {
    readonly __isNixTemplate: true;
    readonly [NIX_TEMPLATE_DESCRIPTOR]?: TemplateDescriptor;
    readonly [NIX_RENDER_PROTOCOL]?: NixRenderProtocol;
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

/** Keyed list result for efficient DOM diffing via `repeat()`. */
export interface KeyedList<T = unknown> {
    readonly __isKeyedList: true;
    readonly items: T[];
    readonly keyFn: (item: T, index: number) => string | number;
    readonly renderFn: (item: T, index: number) => NixTemplate | import("../lifecycle.js").NixComponent;
}

export interface KEntry {
    start: Comment;
    end: Comment;
    cleanup: () => void;
}

/** Opaque token for a named portal target. */
export interface PortalOutlet {
    readonly __isPortalOutlet: true;
    /** @internal */
    _container: Element | null;
}

/** Fallback: a static template/component, or a factory receiving the error. */
export type ErrorFallback =
    | NixTemplate
    | import("../lifecycle.js").NixComponent
    | ((err: unknown) => NixTemplate | import("../lifecycle.js").NixComponent);

/** Content that can be wrapped with `transition()`. */
export type TransitionContent =
    | NixTemplate
    | import("../lifecycle.js").NixComponent
    | (() => NixTemplate | import("../lifecycle.js").NixComponent | null);

export const COMMENT = {
    SCOPE: "nix-scope",
    ERROR_BOUNDARY: "nix-eb",
    TRANSITION: "nix-t",
    KEYED_START: "nix-ks",
    KEYED_END: "nix-ke",
    KEYED_ZONE: "nix-kz",
} as const;

// =============================================================================
// --- DOM inspection helpers ---
// =============================================================================

export function isNixTemplate(v: unknown): v is NixTemplate {
    return (
        v != null &&
        typeof v === "object" &&
        (v as Record<string, unknown>).__isNixTemplate === true
    );
}

export function isKeyedList(v: unknown): v is KeyedList {
    return (
        v != null &&
        typeof v === "object" &&
        (v as Record<string, unknown>).__isKeyedList === true
    );
}
