import {
    _debugComponentMountStart,
    _debugComponentMountEnd,
    _debugComponentUnmount,
    type NixComponent,
} from "../lifecycle.js";
import {
    _captureContextSnapshot,
    _pushComponentContext,
    _popComponentContext,
    _withComponentContext,
} from "../context.js";

// =============================================================================
// --- Component mounting helpers ---
// =============================================================================

/**
 * Renders a NixComponent into the DOM and calls onMount immediately.
 * Propagates errors through onError (or re-throws if not present).
 * Returns a full cleanup function (onUnmount + mountCleanup + renderCleanup).
 */
export function _mountComponent(
    inst: NixComponent,
    parent: Node,
    before: Node | null,
): () => void {
    _debugComponentMountStart(inst);
    _pushComponentContext();
    let renderCleanup!: () => void;
    try {
        try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
        renderCleanup = inst.render()._render(parent, before);
    } finally {
        _debugComponentMountEnd(inst);
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
        _debugComponentUnmount(inst);
    };
}

/**
 * Same as `_mountComponent` but silently swallows all lifecycle errors.
 * Used for transition content and error boundary fallbacks where errors
 * inside the fallback/transition itself must not propagate.
 */
export function _mountComponentSilent(
    inst: NixComponent,
    parent: Node,
    before: Node | null,
): () => void {
    _debugComponentMountStart(inst);
    _pushComponentContext();
    let renderCleanup!: () => void;
    try {
        try { inst.onInit?.(); } catch { /* ignore */ }
        renderCleanup = inst.render()._render(parent, before);
    } finally {
        _debugComponentMountEnd(inst);
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
        _debugComponentUnmount(inst);
    };
}

/**
 * Renders a NixComponent using a captured context snapshot.
 * Used for dynamic/keyed rendering inside reactive effects, where the
 * provide/inject context must be inherited from the point of declaration.
 * Calls onMount immediately. Returns a full cleanup function.
 */
export function _mountComponentWithCtx(
    inst: NixComponent,
    parent: Node,
    before: Node | null,
    ctxSnapshot: ReturnType<typeof _captureContextSnapshot>,
): () => void {
    _debugComponentMountStart(inst);
    let renderCleanup!: () => void;
    try {
        _withComponentContext(ctxSnapshot, () => {
            try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
            renderCleanup = inst.render()._render(parent, before);
        });
    } finally {
        _debugComponentMountEnd(inst);
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
        _debugComponentUnmount(inst);
    };
}

/**
 * Renders a NixComponent with *deferred* onMount — used inside `html` template
 * fragments where the DOM nodes are still in a DocumentFragment and onMount must
 * fire only after the fragment is inserted into the live document.
 *
 * Pushes the full cleanup into `disposes` and the onMount call into `postMountHooks`.
 */
export function _mountComponentDeferred(
    inst: NixComponent,
    parent: Node,
    before: Node | null,
    postMountHooks: Array<() => void>,
    disposes: Array<() => void>,
): void {
    _debugComponentMountStart(inst);
    _pushComponentContext();
    let renderCleanup!: () => void;
    try {
        try { inst.onInit?.(); } catch (e) { if (inst.onError) inst.onError(e); else throw e; }
        renderCleanup = inst.render()._render(parent, before);
    } finally {
        _debugComponentMountEnd(inst);
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
        _debugComponentUnmount(inst);
    });
}
