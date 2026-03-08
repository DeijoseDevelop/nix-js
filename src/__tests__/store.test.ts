import { describe, it, expect, vi } from "vitest";
import { effect } from "../nix/reactivity";
import { createStore } from "../nix/store";

describe("createStore", () => {
    it("creates signals for each property", () => {
        const store = createStore({ count: 0, name: "a" });
        expect(store.count.value).toBe(0);
        expect(store.name.value).toBe("a");
    });

    it("signals are reactive in effects", () => {
        const store = createStore({ x: 1 });
        let captured = 0;
        effect(() => { captured = store.x.value; });
        store.x.value = 42;
        expect(captured).toBe(42);
    });

    it("$reset restores all values to initial", () => {
        const store = createStore({ a: 1, b: "hello" });
        store.a.value = 999;
        store.b.value = "changed";
        store.$reset();
        expect(store.a.value).toBe(1);
        expect(store.b.value).toBe("hello");
    });

    it("supports custom actions", () => {
        const store = createStore(
            { count: 0 },
            (s) => ({
                increment: () => s.count.update(n => n + 1),
                add: (n: number) => s.count.update(c => c + n),
            })
        );
        store.increment();
        expect(store.count.value).toBe(1);
        store.add(10);
        expect(store.count.value).toBe(11);
    });

    it("actions coexist with $reset", () => {
        const store = createStore(
            { count: 5 },
            (s) => ({ double: () => s.count.update(n => n * 2) })
        );
        store.double();
        expect(store.count.value).toBe(10);
        store.$reset();
        expect(store.count.value).toBe(5);
    });

    it("multiple properties reset independently", () => {
        const store = createStore({ x: 0, y: 0, z: 0 });
        store.x.value = 1;
        store.z.value = 3;
        store.$reset();
        expect(store.x.value).toBe(0);
        expect(store.y.value).toBe(0);
        expect(store.z.value).toBe(0);
    });

    it("ignores action named $reset and warns", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const store = createStore(
            { count: 0 },
            (s) => ({ $reset: () => { s.count.value = 999; } })
        );
        // The built-in $reset should still work, not the user's override
        store.count.value = 42;
        store.$reset();
        expect(store.count.value).toBe(0);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('"$reset" is reserved')
        );
        warnSpy.mockRestore();
    });
});
