import { effect } from "../reactivity.js";
import { isNixComponent } from "../lifecycle.js";
import { _captureContextSnapshot } from "../context.js";
import type { KEntry } from "./types.js";
import type { RepeatKey } from "./keyed.js";
import { isNixTemplate, isKeyedList, NIX_RENDER_PROTOCOL } from "./types.js";
import {
    _mountComponent,
    _mountComponentWithCtx,
    _mountComponentDeferred,
} from "./mount-helpers.js";
import { createKeyedMount, reconcileKeyedList } from "./keyed-diff.js";
import { queueDOMWrite } from "./dom-write.js";

// =============================================================================
// --- Reactive node binding ---
// =============================================================================

/**
 * Activates a reactive node binding at `anchor`.
 * Handles: text, NixTemplate, NixComponent, KeyedList, Array, and static values.
 * Pushes dispose functions into `disposes`.
 */
export function activateNodeBinding(
    anchor: Text,
    value: unknown,
    disposes: Array<() => void>,
    postMountHooks: Array<() => void>,
): void {
    if (typeof value !== "function") {
        if (value != null && typeof value === "object" && (value as Record<PropertyKey, unknown>)[NIX_RENDER_PROTOCOL] != null) {
            const proto = (value as Record<PropertyKey, unknown>)[NIX_RENDER_PROTOCOL] as { mountDom?: (ctx: import("./types.js").DomProtocolContext) => (() => void) | void };
            if (proto.mountDom) {
                const cleanup = proto.mountDom({
                    parent: anchor.parentNode!,
                    before: anchor,
                });
                if (cleanup) disposes.push(cleanup);
                return;
            }
        }
        if (isNixComponent(value)) {
            _mountComponentDeferred(value, anchor.parentNode!, anchor, postMountHooks, disposes);
        } else if (isNixTemplate(value)) {
            disposes.push(value._render(anchor.parentNode!, anchor));
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
        return;
    }

    // Reactive function path
    let textNode: Text | null = null;
    let innerCleanup: (() => void) | null = null;

    type Key = RepeatKey;
    let keyedState: Map<Key, KEntry> | null = null;
    let prevKeyOrder: Key[] = [];
    let keyedZoneStart: Node | null = null;

    const ctxSnapshot = _captureContextSnapshot();
    const keyedMount = createKeyedMount(ctxSnapshot);

    let _textQueued = false;
    let _pendingText = "";
    let _isFirstText = true;

    const dispose = effect(() => {
        const v = (value as () => unknown)();

        if (typeof v === "string" || typeof v === "number") {
            _pendingText = String(v);

            const update = () => {
                _textQueued = false;
                if (innerCleanup) {
                    innerCleanup();
                    innerCleanup = null;
                }
                if (!textNode) {
                    textNode = document.createTextNode(_pendingText);
                    anchor.parentNode!.insertBefore(textNode, anchor);
                } else {
                    textNode.nodeValue = _pendingText;
                }
            };

            if (_isFirstText) {
                _isFirstText = false;
                update();
            } else if (!_textQueued) {
                _textQueued = true;
                queueDOMWrite(update);
            }
            return;
        }

        _textQueued = false;
        _isFirstText = false;

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
        } else if (v != null && typeof v === "object" && (v as Record<PropertyKey, unknown>)[NIX_RENDER_PROTOCOL] != null) {
            const proto = (v as Record<PropertyKey, unknown>)[NIX_RENDER_PROTOCOL] as { mountDom?: (ctx: import("./types.js").DomProtocolContext) => (() => void) | void };
            if (proto.mountDom) {
                innerCleanup = proto.mountDom({ parent: anchor.parentNode!, before: anchor }) ?? null;
            } else {
                textNode = document.createTextNode(String(v));
                anchor.parentNode!.insertBefore(textNode, anchor);
            }
        } else if (isNixTemplate(v)) {
            innerCleanup = v._render(anchor.parentNode!, anchor);
        } else if (isNixComponent(v)) {
            innerCleanup = _mountComponentWithCtx(v, anchor.parentNode!, anchor, ctxSnapshot);
        } else if (isKeyedList(v)) {

            if (!keyedState) {
                keyedState = new Map();
                keyedZoneStart = document.createTextNode("");
                anchor.parentNode!.insertBefore(keyedZoneStart, anchor);
            }

            reconcileKeyedList({
                zoneStart: keyedZoneStart!,
                anchor,
                state: keyedState,
                prevOrder: prevKeyOrder,
                list: v,
                mount: keyedMount,
                onDuplicateKey: (key) => {
                    console.warn(`[nix-js] repeat(): duplicate key "${key}". Keys must be unique; the previous entry leaks (orphaned nodes + live effects).`);
                },
            });
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
