// =============================================================================
// --- Public types ---
// =============================================================================

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

/** Keyed list result for efficient DOM diffing via `repeat()`. */
export interface KeyedList<T = unknown> {
    readonly __isKeyedList: true;
    readonly items: T[];
    readonly keyFn: (item: T, index: number) => string | number;
    readonly renderFn: (item: T, index: number) => NixTemplate | import("../lifecycle").NixComponent;
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
    | import("../lifecycle").NixComponent
    | ((err: unknown) => NixTemplate | import("../lifecycle").NixComponent);

/** Content that can be wrapped with `transition()`. */
export type TransitionContent =
    | NixTemplate
    | import("../lifecycle").NixComponent
    | (() => NixTemplate | import("../lifecycle").NixComponent | null);

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
