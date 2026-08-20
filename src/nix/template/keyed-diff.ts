import { batch } from "../reactivity.js";
import { isNixComponent } from "../lifecycle.js";
import { _mountComponentWithCtx } from "./mount-helpers.js";
import { isNixTemplate, type KEntry, type KeyedList } from "./types.js";
import { getSequence, type RepeatKey } from "./keyed.js";

// =============================================================================
// --- Shared keyed list reconciliation (mount + hydrate) ---
// =============================================================================

/**
 * Mounts a single keyed item's rendered value before `endMarker` inside `parent`.
 * Used by the DOM renderer and the hydration renderer so both engines share the
 * exact same reconciliation semantics.
 */
export function createKeyedMount(
    ctxSnapshot: Map<unknown, unknown>[],
): (rendered: unknown, parent: Node, endMarker: Node) => () => void {
    return (rendered: unknown, parent: Node, endMarker: Node): (() => void) => {
        if (isNixComponent(rendered)) {
            return _mountComponentWithCtx(rendered, parent, endMarker, ctxSnapshot);
        }
        if (isNixTemplate(rendered)) {
            return rendered._render(parent, endMarker);
        }
        if (rendered != null && rendered !== false) {
            const node = document.createTextNode(String(rendered));
            parent.insertBefore(node, endMarker);
            return () => node.parentNode?.removeChild(node);
        }
        return () => { };
    };
}

export interface KeyedDiffOptions {
    /** Node marking the start of the keyed zone. */
    zoneStart: Node;
    /** End boundary; new content is inserted before this node. */
    anchor: Node;
    /** Live map of key → entry (start/end markers + cleanup). */
    state: Map<RepeatKey, KEntry>;
    /** Key order from the previous reconciliation pass. */
    prevOrder: RepeatKey[];
    /** The current keyed list value. */
    list: KeyedList;
    /** Mounts a freshly rendered item into the DOM. */
    mount: (rendered: unknown, parent: Node, endMarker: Node) => () => void;
    /** Context snapshot for component mounts inside the effect. */
    ctxSnapshot?: Map<unknown, unknown>[];
    /** Called when a duplicate key is encountered. */
    onDuplicateKey?: (key: RepeatKey) => void;
}

/**
 * Reconciles a keyed list between `zoneStart` and `anchor` using the same LIS
 * algorithm used by the DOM renderer. Total replacement (O(1)) when no key
 * survives; otherwise remove/insert/move with minimal DOM operations.
 */
export function reconcileKeyedList(opts: KeyedDiffOptions): void {
    const { zoneStart, anchor, state, prevOrder, list, mount } = opts;
    const parent = anchor.parentNode;
    if (!parent) return;

    const newKeyOrder: RepeatKey[] = list.items.map((item, idx) => list.keyFn(item as never, idx));
    const newKeySet = new Set(newKeyOrder);

    let anyKeysSurvive = false;
    if (state.size > 0) {
        for (const k of state.keys()) {
            if (newKeySet.has(k)) {
                anyKeysSurvive = true;
                break;
            }
        }
    }

    // 1. Initial render or total replacement (O(1) path)
    if (!anyKeysSurvive) {
        if (state.size > 0) {
            const range = document.createRange();
            range.setStartAfter(zoneStart);
            range.setEndBefore(anchor);
            range.deleteContents();
            for (const entry of state.values()) entry.cleanup();
            state.clear();
        }

        if (newKeyOrder.length > 0) {
            const frag = document.createDocumentFragment();
            batch(() => {
                for (let i = 0; i < newKeyOrder.length; i++) {
                    const key = newKeyOrder[i];
                    const item = list.items[i];
                    const start = document.createTextNode("") as unknown as Comment;
                    const end = document.createTextNode("") as unknown as Comment;

                    frag.appendChild(start);
                    frag.appendChild(end);

                    const rendered = list.renderFn(item as never, i);
                    const cleanup = mount(rendered, frag, end);

                    if (state.has(key)) opts.onDuplicateKey?.(key);
                    state.set(key, { start, end, cleanup });
                }
            });
            parent.insertBefore(frag, anchor);
        }
        prevOrder.length = 0;
        prevOrder.push(...newKeyOrder);
        return;
    }

    // 2. Reconciliation with LIS
    const keyToNewIndex = new Map<RepeatKey, number>();
    for (let i = 0; i < newKeyOrder.length; i++) {
        keyToNewIndex.set(newKeyOrder[i], i);
    }

    const newIndexToOldIndexMap = new Int32Array(newKeyOrder.length);
    let moved = false;
    let maxNewIndexSoFar = 0;

    for (let i = 0; i < prevOrder.length; i++) {
        const key = prevOrder[i];
        const newIndex = keyToNewIndex.get(key);

        if (newIndex === undefined) {
            const entry = state.get(key)!;
            entry.cleanup();
            let node: Node | null = entry.start;
            while (node) {
                const next: ChildNode | null = node === entry.end ? null : node.nextSibling;
                node.parentNode?.removeChild(node);
                if (!next) break;
                node = next;
            }
            state.delete(key);
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
            const it = list.items[i];
            const sMarker = document.createTextNode("") as unknown as Comment;
            const eMarker = document.createTextNode("") as unknown as Comment;
            const frag = document.createDocumentFragment();

            frag.appendChild(sMarker);
            frag.appendChild(eMarker);

            const rendered = list.renderFn(it as never, i);
            const cleanup = mount(rendered, frag, eMarker);

            if (state.has(key)) opts.onDuplicateKey?.(key);
            state.set(key, { start: sMarker, end: eMarker, cleanup });
            parent.insertBefore(frag, insertionPoint);
            insertionPoint = sMarker;
        } else {
            const entry = state.get(key)!;
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

    prevOrder.length = 0;
    prevOrder.push(...newKeyOrder);
}