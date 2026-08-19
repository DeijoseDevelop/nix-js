import { effect } from "../reactivity";
import { batch } from "../reactivity";
import { isNixComponent } from "../lifecycle";
import { _captureContextSnapshot } from "../context";
import type { KEntry } from "./types";
import { isNixTemplate, isKeyedList } from "./types";
import {
    _mountComponent,
    _mountComponentWithCtx,
    _mountComponentDeferred,
} from "./mount-helpers";
import { getSequence } from "./keyed";
import { queueDOMWrite } from "./dom-write";

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

    type Key = string | number;
    let keyedState: Map<Key, KEntry> | null = null;
    let prevKeyOrder: Key[] = [];
    let keyedZoneStart: Node | null = null;

    const ctxSnapshot = _captureContextSnapshot();

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

            // 1. Initial Render or Total Replacement (O(1) path)
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
                    batch(() => {
                        for (let i = 0; i < newKeyOrder.length; i++) {
                            const key = newKeyOrder[i];
                            const item = v.items[i];
                            const start = document.createTextNode("") as unknown as Comment;
                            const end = document.createTextNode("") as unknown as Comment;

                            frag.appendChild(start);
                            frag.appendChild(end);

                            const rendered = v.renderFn(item as never, i);
                            const cleanup = isNixComponent(rendered)
                                ? _mountComponentWithCtx(rendered, frag, end, ctxSnapshot)
                                : rendered._render(frag, end);

                            if (keyedState!.has(key)) {
                                console.warn(`[nix-js] repeat(): duplicate key "${key}". Keys must be unique; the previous entry leaks (orphaned nodes + live effects).`);
                            }
                            keyedState?.set(key, { start, end, cleanup });
                        }
                    });
                    parent.insertBefore(frag, anchor);
                }
                prevKeyOrder = newKeyOrder;
                return;
            }

            // 2. Reconciliation with LIS
            const keyToNewIndex = new Map<Key, number>();
            for (let i = 0; i < newKeyOrder.length; i++) {
                keyToNewIndex.set(newKeyOrder[i], i);
            }

            const newIndexToOldIndexMap = new Int32Array(newKeyOrder.length);
            let moved = false;
            let maxNewIndexSoFar = 0;

            for (let i = 0; i < prevKeyOrder.length; i++) {
                const key = prevKeyOrder[i];
                const newIndex = keyToNewIndex.get(key);

                if (newIndex === undefined) {
                    const entry = keyedState.get(key)!;
                    entry.cleanup();
                    let node: Node | null = entry.start;
                    while (node) {
                        const next: ChildNode | null = node === entry.end ? null : node.nextSibling;
                        node.parentNode?.removeChild(node);
                        if (!next) break;
                        node = next;
                    }
                    keyedState.delete(key);
                } else {
                    newIndexToOldIndexMap[newIndex] = i + 1;
                    if (newIndex >= maxNewIndexSoFar) {
                        maxNewIndexSoFar = newIndex;
                    } else {
                        moved = true;
                    }
                }
            }

            const increasingNewIndexSequence = moved ? getSequence(newIndexToOldIndexMap) : [];
            let j = increasingNewIndexSequence.length - 1;
            let insertionPoint: Node = anchor;

            for (let i = newKeyOrder.length - 1; i >= 0; i--) {
                const key = newKeyOrder[i];
                const isNew = newIndexToOldIndexMap[i] === 0;

                if (isNew) {
                    const it = v.items[i];
                    const sMarker = document.createTextNode("") as unknown as Comment;
                    const eMarker = document.createTextNode("") as unknown as Comment;
                    const frag = document.createDocumentFragment();

                    frag.appendChild(sMarker);
                    frag.appendChild(eMarker);

                    const rendered = v.renderFn(it as never, i);
                    const cleanup = isNixComponent(rendered)
                        ? _mountComponentWithCtx(rendered, frag, eMarker, ctxSnapshot)
                        : rendered._render(frag, eMarker);

                    if (keyedState.has(key)) {
                        console.warn(`[nix-js] repeat(): duplicate key "${key}". Keys must be unique; the previous entry leaks (orphaned nodes + live effects).`);
                    }
                    keyedState.set(key, { start: sMarker, end: eMarker, cleanup });
                    parent.insertBefore(frag, insertionPoint);
                    insertionPoint = sMarker;
                } else {
                    const entry = keyedState.get(key)!;
                    if (moved) {
                        if (j < 0 || i !== increasingNewIndexSequence[j]) {
                            let node: Node | null = entry.start;
                            while (node) {
                                const next: ChildNode | null = node === entry.end ? null : node.nextSibling;
                                parent.insertBefore(node, insertionPoint);
                                if (!next) break;
                                node = next;
                            }
                        } else {
                            j--;
                        }
                    }
                    insertionPoint = entry.start;
                }
            }

            prevKeyOrder = newKeyOrder;
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
