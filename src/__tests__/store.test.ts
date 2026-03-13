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

    describe("$patch", () => {
        it("actualiza solo las propiedades indicadas", () => {
            const store = createStore({ a: 1, b: 2, c: 3 });
            store.$patch({ a: 10, c: 30 });
            expect(store.a.value).toBe(10);
            expect(store.b.value).toBe(2); // sin tocar
            expect(store.c.value).toBe(30);
        });

        it("$patch con un objeto vacío no cambia nada", () => {
            const store = createStore({ x: 5 });
            store.$patch({});
            expect(store.x.value).toBe(5);
        });

        it("$patch ignora keys que no existen en el store", () => {
            const store = createStore({ count: 0 });
            // no debe tirar ni crear una nueva propiedad
            expect(() => {
                store.$patch({ count: 1, unknown: 99 } as any);
            }).not.toThrow();
            expect(store.count.value).toBe(1);
            expect((store as any).unknown?.value).toBeUndefined();
        });

        it("$patch es reactivo — los effects se re-ejecutan", () => {
            const store = createStore({ a: 0, b: 0 });
            const captured: number[] = [];
            effect(() => { captured.push(store.a.value); });
            store.$patch({ a: 7 });
            expect(captured).toEqual([0, 7]);
        });

        it("$patch seguido de $reset vuelve al estado inicial", () => {
            const store = createStore({ x: 1, y: 2 });
            store.$patch({ x: 99 });
            store.$reset();
            expect(store.x.value).toBe(1);
            expect(store.y.value).toBe(2);
        });
    });

    describe("$state", () => {
        it("retorna un snapshot con todos los valores actuales", () => {
            const store = createStore({ a: 1, b: "hello" });
            expect(store.$state).toEqual({ a: 1, b: "hello" });
        });

        it("$state se actualiza cuando cambia un signal", () => {
            const store = createStore({ count: 0 });
            store.count.value = 42;
            expect(store.$state.count).toBe(42);
        });

        it("$state refleja $patch inmediatamente", () => {
            const store = createStore({ x: 0, y: 0 });
            store.$patch({ x: 5 });
            expect(store.$state).toEqual({ x: 5, y: 0 });
        });

        it("$state refleja $reset inmediatamente", () => {
            const store = createStore({ n: 10 });
            store.n.value = 99;
            store.$reset();
            expect(store.$state.n).toBe(10);
        });

        it("$state es reactivo — un effect lo re-ejecuta al cambiar señales", () => {
            const store = createStore({ val: 1 });
            let snapshots: number[] = [];
            effect(() => { snapshots.push(store.$state.val); });
            store.val.value = 2;
            store.val.value = 3;
            expect(snapshots).toEqual([1, 2, 3]);
        });

        it("$state devuelve un objeto nuevo en cada lectura (no cached stale)", () => {
            const store = createStore({ a: 1 });
            const s1 = store.$state;
            store.a.value = 2;
            const s2 = store.$state;
            // El snapshot anterior no muta — son objetos distintos
            expect(s1.a).toBe(1);
            expect(s2.a).toBe(2);
        });
    });

    it("throws si una key de initialState es '$patch'", () => {
        expect(() => createStore({ $patch: 1 } as any)).toThrow('"$patch" is reserved');
    });

    it("ignora acción nombrada '$patch' y advierte", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
        const store = createStore(
            { count: 0 },
            () => ({ $patch: () => {} })
        );
        // $patch built-in sigue funcionando
        store.$patch({ count: 5 });
        expect(store.count.value).toBe(5);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('"$patch" is reserved')
        );
        warnSpy.mockRestore();
    });
});
