// =============================================================================
// --- DOM Write Batching (Microtask Queue) ---
// =============================================================================

const _domWriteQueue = new Set<() => void>();
let _isDomWriteScheduled = false;

/**
 * Queues a DOM mutation to run in the next microtask.
 * Avoids Layout Thrashing by grouping multiple writes into a single frame.
 */
export function queueDOMWrite(task: () => void): void {
    _domWriteQueue.add(task);
    if (!_isDomWriteScheduled) {
        _isDomWriteScheduled = true;
        queueMicrotask(() => {
            for (const t of _domWriteQueue) {
                try {
                    t();
                } catch (e) {
                    // Evitamos que un error rompa el hilo entero
                    console.error("[Nix.js] Error in DOM write task:", e);
                }
            }
            _domWriteQueue.clear();
            _isDomWriteScheduled = false;
        });
    }
}
