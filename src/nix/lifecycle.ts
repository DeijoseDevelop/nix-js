import type { NixTemplate } from "./template";

// --- NixChildren ---

/** Valid child content for components. */
export type NixChildren =
    | NixTemplate
    | NixComponent
    | Array<NixTemplate | NixComponent>
    | null
    | undefined;

// --- NixComponent ---

/** Base class for components with lifecycle hooks. */
export abstract class NixComponent {
    /** @internal */
    readonly __isNixComponent = true as const;

    /** Default slot — child content injected by the parent. */
    children?: NixChildren;

    /** Optional label used by devtools. Falls back to class name. */
    _debugName?: string;

    /** @internal */
    private _slots = new Map<string, NixChildren>();

    /** Sets the default slot content. Returns `this` for chaining. */
    setChildren(content: NixChildren): this {
        this.children = content;
        return this;
    }

    /** Sets a named slot. Returns `this` for chaining. */
    setSlot(name: string, content: NixChildren): this {
        this._slots.set(name, content);
        return this;
    }

    /** Returns content for a named slot. */
    slot(name: string): NixChildren {
        return this._slots.get(name);
    }

    /** Sets an explicit devtools display name. Returns `this` for chaining. */
    setDebugName(name: string): this {
        this._debugName = name;
        return this;
    }

    /** Returns the component template. Called once on mount; updates happen via signals. */
    abstract render(): NixTemplate;

    /** Called before `render()` — no DOM yet. Errors are caught by `onError` if present. */
    onInit?(): void;

    /** Called after DOM insertion. May return a cleanup function. */
    onMount?(): (() => void) | void;

    /** Called before DOM removal. */
    onUnmount?(): void;

    /** Catches errors thrown in `onInit` and `onMount`. */
    onError?(err: unknown): void;
}

// --- Type guard ---

/** @internal */
export function isNixComponent(v: unknown): v is NixComponent {
    return (
        v != null &&
        typeof v === "object" &&
        (v as Record<string, unknown>).__isNixComponent === true
    );
}

// --- Devtools component tracking (internal) ---

export interface _ComponentDebugHooks {
    onMountStart?: (inst: NixComponent) => void;
    onMountEnd?: (inst: NixComponent) => void;
    onUnmount?: (inst: NixComponent) => void;
}

let _componentDebugHooks: _ComponentDebugHooks | null = null;

export function _setComponentDebugHooks(hooks: _ComponentDebugHooks | null): void {
    _componentDebugHooks = hooks;
}

export function _debugComponentMountStart(inst: NixComponent): void {
    _componentDebugHooks?.onMountStart?.(inst);
}

export function _debugComponentMountEnd(inst: NixComponent): void {
    _componentDebugHooks?.onMountEnd?.(inst);
}

export function _debugComponentUnmount(inst: NixComponent): void {
    _componentDebugHooks?.onUnmount?.(inst);
}
