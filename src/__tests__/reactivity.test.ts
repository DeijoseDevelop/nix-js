import { describe, it, expect, vi } from "vitest";
import { signal, effect, computed, batch, untrack, watch, nextTick, _getNotifyBufSize } from "../nix/reactivity";

// ── Signal ────────────────────────────────────────────────────────────────────

describe("signal", () => {
    it("stores and returns its initial value", () => {
        const s = signal(42);
        expect(s.value).toBe(42);
    });

    it("updates value when written", () => {
        const s = signal("a");
        s.value = "b";
        expect(s.value).toBe("b");
    });

    it("does not notify when set to same value (Object.is)", () => {
        const s = signal(1);
        let runs = 0;
        effect(() => { s.value; runs++; });
        runs = 0;
        s.value = 1; // same value
        expect(runs).toBe(0);
    });

    it("update() applies a function", () => {
        const s = signal(10);
        s.update(n => n + 5);
        expect(s.value).toBe(15);
    });

    it("peek() reads without subscribing", () => {
        const s = signal(0);
        let runs = 0;
        effect(() => { s.peek(); runs++; });
        runs = 0;
        s.value = 1;
        expect(runs).toBe(0);
    });

    it("dispose() removes all subscriptions", () => {
        const s = signal(0);
        let runs = 0;
        effect(() => { s.value; runs++; });
        runs = 0;
        s.dispose();
        s.value = 99;
        expect(runs).toBe(0);
    });
});

// ── effect ────────────────────────────────────────────────────────────────────

describe("effect", () => {
    it("runs immediately on creation", () => {
        const fn = vi.fn();
        effect(fn);
        expect(fn).toHaveBeenCalledOnce();
    });

    it("re-runs when a read signal changes", () => {
        const s = signal(0);
        let value = -1;
        effect(() => { value = s.value; });
        s.value = 5;
        expect(value).toBe(5);
    });

    it("stops re-running after dispose", () => {
        const s = signal(0);
        let runs = 0;
        const dispose = effect(() => { s.value; runs++; });
        runs = 0;
        dispose();
        s.value = 1;
        expect(runs).toBe(0);
    });

    it("calls cleanup function before each re-run", () => {
        const s = signal(0);
        const cleanup = vi.fn();
        effect(() => { s.value; return cleanup; });
        expect(cleanup).not.toHaveBeenCalled();
        s.value = 1;
        expect(cleanup).toHaveBeenCalledOnce();
    });

    it("calls cleanup on dispose", () => {
        const s = signal(0);
        const cleanup = vi.fn();
        const dispose = effect(() => { s.value; return cleanup; });
        dispose();
        expect(cleanup).toHaveBeenCalledOnce();
    });

    it("tracks only signals read in the latest run (auto-cleanup)", () => {
        const a = signal(true);
        const b = signal(0);
        const c = signal(0);
        let runs = 0;
        effect(() => {
            runs++;
            if (a.value) b.value;
            else c.value;
        });
        runs = 0;

        // b is tracked
        b.value = 1;
        expect(runs).toBe(1);

        // switch branch — now c is tracked, b is not
        a.value = false;
        runs = 0;
        b.value = 2;
        expect(runs).toBe(0);
        c.value = 1;
        expect(runs).toBe(1);
    });

    it("shrinks oversized notify buffer after low usage", () => {
        const s = signal(0);
        const disposers = Array.from({ length: 80 }, () => effect(() => { s.value; }));

        // Grow notify buffer with a high fan-out update.
        s.value = 1;
        expect(_getNotifyBufSize()).toBeGreaterThan(64);

        // Keep only a small subscriber set and trigger low-usage notify.
        for (let i = 0; i < 70; i++) disposers[i]();
        s.value = 2;
        expect(_getNotifyBufSize()).toBe(32);

        for (let i = 70; i < disposers.length; i++) disposers[i]();
    });
});

// ── computed ──────────────────────────────────────────────────────────────────

describe("computed", () => {
    it("is lazy: does not evaluate until first .value read", () => {
        let runs = 0;
        const c = computed(() => {
            runs++;
            return 123;
        });

        expect(runs).toBe(0);
        expect(c.value).toBe(123);
        expect(runs).toBe(1);
    });

    it("derives value from signals", () => {
        const a = signal(2);
        const b = signal(3);
        const sum = computed(() => a.value + b.value);
        expect(sum.value).toBe(5);
    });

    it("updates when source signal changes", () => {
        const a = signal(1);
        const doubled = computed(() => a.value * 2);
        a.value = 4;
        expect(doubled.value).toBe(8);
    });

    it("is reactive in effects", () => {
        const a = signal(1);
        const doubled = computed(() => a.value * 2);
        let captured = 0;
        effect(() => { captured = doubled.value; });
        a.value = 5;
        expect(captured).toBe(10);
    });

    it("dispose before first read does not evaluate", () => {
        let runs = 0;
        const c = computed(() => {
            runs++;
            return 1;
        });

        c.dispose();
        expect(runs).toBe(0);
    });
});

// ── batch ─────────────────────────────────────────────────────────────────────

describe("batch", () => {
    it("defers effect execution until batch ends", () => {
        const a = signal(0);
        const b = signal(0);
        let runs = 0;
        effect(() => { a.value + b.value; runs++; });
        runs = 0;
        batch(() => { a.value = 1; b.value = 2; });
        expect(runs).toBe(1);
    });

    it("allows reading up-to-date values inside batch", () => {
        const s = signal(0);
        batch(() => {
            s.value = 42;
            expect(s.value).toBe(42);
        });
    });
});

// ── untrack ───────────────────────────────────────────────────────────────────

describe("untrack", () => {
    it("reads signal without subscribing effect", () => {
        const s = signal(0);
        let runs = 0;
        effect(() => {
            untrack(() => s.value);
            runs++;
        });
        runs = 0;
        s.value = 1;
        expect(runs).toBe(0);
    });

    it("returns the value from fn", () => {
        const s = signal(42);
        const v = untrack(() => s.value);
        expect(v).toBe(42);
    });
});

// ── watch ─────────────────────────────────────────────────────────────────────

describe("watch", () => {
    it("calls callback when signal changes", () => {
        const s = signal(0);
        const cb = vi.fn();
        watch(s, cb);
        s.value = 1;
        expect(cb).toHaveBeenCalledWith(1, 0);
    });

    it("calls callback with getter source", () => {
        const a = signal(1);
        const b = signal(2);
        const cb = vi.fn();
        watch(() => a.value + b.value, cb);
        a.value = 5;
        expect(cb).toHaveBeenCalledWith(7, 3);
    });

    it("immediate: true fires callback immediately", () => {
        const s = signal(10);
        const cb = vi.fn();
        watch(s, cb, { immediate: true });
        expect(cb).toHaveBeenCalledWith(10, undefined);
    });

    it("once: true auto-disposes after first callback", () => {
        const s = signal(0);
        const cb = vi.fn();
        watch(s, cb, { once: true });
        s.value = 1;
        s.value = 2;
        // once — second change should not fire
        expect(cb).toHaveBeenCalledTimes(1);
        expect(cb).toHaveBeenCalledWith(1, 0);
    });

    it("dispose() stops watching", () => {
        const s = signal(0);
        const cb = vi.fn();
        const stop = watch(s, cb);
        stop();
        s.value = 1;
        expect(cb).not.toHaveBeenCalled();
    });
});

// ── nextTick ──────────────────────────────────────────────────────────────────

describe("nextTick", () => {
    it("resolves after microtask", async () => {
        const s = signal(0);
        s.value = 1;
        await nextTick();
        expect(s.value).toBe(1);
    });

    it("runs callback if provided", async () => {
        const fn = vi.fn();
        await nextTick(fn);
        expect(fn).toHaveBeenCalledOnce();
    });
});

// ── Effect recursion guard ────────────────────────────────────────────────────

describe("effect recursion guard", () => {
    it("throws when effect exceeds max recursion depth", () => {
        const s = signal(0);
        expect(() => {
            effect(() => { s.value = s.value + 1; });
        }).toThrow(/Maximum effect re-execution depth exceeded/);
    });

    it("normal nested reads do not trigger the guard", () => {
        const a = signal(1);
        const b = signal(2);
        let result = 0;
        effect(() => { result = a.value + b.value; });
        a.value = 10;
        expect(result).toBe(12);
    });
});
