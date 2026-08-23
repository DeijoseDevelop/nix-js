import { describe, it, expect } from "vitest";
import { createStore } from "../nix/store.js";

// =============================================================================
// structuredClone escape hatch — custom serialize option
// =============================================================================

describe("Fix #5: Store serialize escape hatch", () => {
    it("custom serialize allows non-serializable state (functions)", () => {
        // structuredClone cannot clone functions — this would throw without serialize
        const initial = { fn: () => 42, count: 0 };
        const store = createStore(initial, {
            serialize: (s) => ({ fn: s.fn, count: s.count }),
        });

        expect(store.fn.value()).toBe(42);
        expect(store.count.value).toBe(0);

        store.count.value = 10;
        store.$reset();
        expect(store.count.value).toBe(0);
    });

    it("custom serialize allows Map in store state", () => {
        const initial = { map: new Map([["a", 1], ["b", 2]]) };
        const store = createStore(initial, {
            serialize: (s) => ({ map: new Map(s.map) }),
        });

        // $reset should restore the original Map
        store.map.value = new Map([["c", 3]]);
        expect(store.map.value.get("c")).toBe(3);

        store.$reset();
        expect(store.map.value.get("a")).toBe(1);
        expect(store.map.value.get("b")).toBe(2);
        expect(store.map.value.get("c")).toBeUndefined();
    });

    it("custom serialize allows Set in store state", () => {
        const initial = { set: new Set([1, 2, 3]) };
        const store = createStore(initial, {
            serialize: (s) => ({ set: new Set(s.set) }),
        });

        store.set.value = new Set([4, 5]);
        store.$reset();

        expect(store.set.value.has(1)).toBe(true);
        expect(store.set.value.has(2)).toBe(true);
        expect(store.set.value.has(3)).toBe(true);
        expect(store.set.value.has(4)).toBe(false);
    });

    it("custom serialize allows class instances", () => {
        class Point {
            x: number;
            y: number;
            constructor(x: number, y: number) { this.x = x; this.y = y; }
            clone() { return new Point(this.x, this.y); }
        }

        const initial = { point: new Point(1, 2) };
        const store = createStore(initial, {
            serialize: (s) => ({ point: s.point.clone() }),
        });

        store.point.value = new Point(10, 20);
        store.$reset();

        expect(store.point.value.x).toBe(1);
        expect(store.point.value.y).toBe(2);
    });

    it("structuredClone still works by default (no serialize option)", () => {
        const store = createStore({ count: 0, name: "test" });
        store.count.value = 42;
        store.name.value = "modified";
        store.$reset();

        expect(store.count.value).toBe(0);
        expect(store.name.value).toBe("test");
    });

    it("error message mentions serialize option when structuredClone fails", () => {
        // Functions cannot be structuredClone'd
        try {
            createStore({ fn: () => 42 });
            expect.fail("should have thrown");
        } catch (e) {
            const msg = (e as Error).message;
            expect(msg).toContain("serialize");
            expect(msg).toContain("non-serializable");
        }
    });

    it("serialize is called once at store creation for baseline", () => {
        let callCount = 0;
        const store = createStore(
            { count: 0 },
            { serialize: (s) => { callCount++; return { count: s.count }; } },
        );
        expect(callCount).toBe(1);
        store.count.value = 5;
        store.$reset();
        // serialize is NOT called again on $reset — baseline is cached
        expect(callCount).toBe(1);
        expect(store.count.value).toBe(0);
    });
});
