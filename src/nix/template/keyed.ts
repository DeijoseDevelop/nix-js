import type { NixTemplate, KeyedList, KEntry } from "./types";
import type { NixComponent } from "../lifecycle";

// =============================================================================
// --- repeat() ---
// =============================================================================

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
// --- Longest Increasing Subsequence (LIS) ---
// =============================================================================

/**
 * Returns the indices of the Longest Increasing Subsequence.
 * Used to minimize DOM operations during list diffing.
 */
export function getSequence(arr: Int32Array | number[]): number[] {
    const p = arr.slice();
    const result = [0];
    let i, j, u, v, c;
    const len = arr.length;
    for (i = 0; i < len; i++) {
        const arrI = arr[i];
        if (arrI !== 0) {
            j = result[result.length - 1];
            if (arr[j] < arrI) {
                p[i] = j;
                result.push(i);
                continue;
            }
            u = 0;
            v = result.length - 1;
            while (u < v) {
                c = (u + v) >> 1;
                if (arr[result[c]] < arrI) {
                    u = c + 1;
                } else {
                    v = c;
                }
            }
            if (arrI < arr[result[u]]) {
                if (u > 0) {
                    p[i] = result[u - 1];
                }
                result[u] = i;
            }
        }
    }
    u = result.length;
    v = result[u - 1];
    while (u-- > 0) {
        result[u] = v;
        v = p[v];
    }
    return result;
}

export type { KEntry };
