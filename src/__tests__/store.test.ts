import { describe, it, expect, vi } from "vitest";
import { computed, effect } from "../nix/reactivity";
import { createStore } from "../nix/store";
import { guardPlugin } from "../nix/plugins";

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
            {
                actions: (s) => ({
                    increment: () => s.count.update(n => n + 1),
                    add: (n: number) => s.count.update(c => c + n),
                }),
            }
        );
        store.increment();
        expect(store.count.value).toBe(1);
        store.add(10);
        expect(store.count.value).toBe(11);
    });

    it("supports computed getters via getters option", () => {
        const store = createStore(
            { count: 2, items: ["a", "b"] as string[] },
            {
                actions: (s) => ({ increment: () => s.count.value++ }),
                getters: (s) => ({
                    double: computed(() => s.count.value * 2),
                    total: computed(() => s.items.value.length),
                }),
            },
        );

        expect(store.double.value).toBe(4);
        expect(store.total.value).toBe(2);

        store.increment();
        expect(store.count.value).toBe(3);
        expect(store.double.value).toBe(6);

        store.items.value = [...store.items.value, "c"];
        expect(store.total.value).toBe(3);
    });

    it("actions coexist with $reset", () => {
        const store = createStore(
            { count: 5 },
            { actions: (s) => ({ double: () => s.count.update(n => n * 2) }) }
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
            { actions: (s) => ({ $reset: () => { s.count.value = 999; } }) }
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

    it("ignores getter named $state and warns", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const store = createStore(
            { count: 1 },
            { getters: (s) => ({ $state: computed(() => s.count.value * 10) }) },
        );

        // Built-in $state must still be available
        expect(store.$state.count).toBe(1);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('getter "$state" is reserved')
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

    describe("$watch", () => {
        it("notifica el nuevo estado cuando cambian señales", () => {
            const store = createStore({ count: 0, name: "nix" });
            const calls: Array<[number, string]> = [];

            const stop = store.$watch((next) => {
                calls.push([next.count, next.name]);
            });

            store.count.value = 1;
            store.name.value = "nix-js";

            expect(calls).toEqual([
                [1, "nix"],
                [1, "nix-js"],
            ]);

            stop();
        });

        it("entrega el estado previo como segundo argumento", () => {
            const store = createStore({ count: 0 });
            const pairs: Array<[number, number | undefined]> = [];

            const stop = store.$watch((next, prev) => {
                pairs.push([next.count, prev?.count]);
            });

            store.count.value = 5;

            expect(pairs).toEqual([[5, 0]]);
            stop();
        });

        it("retorna unsubscribe y deja de emitir cambios", () => {
            const store = createStore({ value: 1 });
            const calls: number[] = [];

            const stop = store.$watch((next) => {
                calls.push(next.value);
            });

            store.value.value = 2;
            stop();
            store.value.value = 3;

            expect(calls).toEqual([2]);
        });

        it("observa cambios hechos via $patch y $reset (una vez por lote)", () => {
            const store = createStore({ a: 1, b: 2 });
            const calls: number[] = [];

            const stop = store.$watch((next) => {
                calls.push(next.a);
            });

            store.$patch({ a: 10 });
            store.$reset();

            expect(calls).toEqual([10, 1]);

            stop();
        });
    });

    it("throws si una key de initialState es '$patch'", () => {
        expect(() => createStore({ $patch: 1 } as any)).toThrow('"$patch" is reserved');
    });

    it("ignora acción nombrada '$patch' y advierte", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const store = createStore(
            { count: 0 },
            { actions: () => ({ $patch: () => { } }) }
        );
        // $patch built-in sigue funcionando
        store.$patch({ count: 5 });
        expect(store.count.value).toBe(5);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('"$patch" is reserved')
        );
        warnSpy.mockRestore();
    });

    it("ignora acción nombrada '$watch' y advierte", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        const store = createStore(
            { count: 0 },
            { actions: () => ({ $watch: () => { } }) }
        );

        // built-in $watch debe seguir existiendo
        const stop = store.$watch(() => { });
        expect(typeof stop).toBe("function");
        stop();

        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('"$watch" is reserved')
        );
        warnSpy.mockRestore();
    });
});

// ── guardPlugin ───────────────────────────────────────────────────────────────

describe("guardPlugin", () => {
    it("transforms $patch payloads", () => {
        const store = createStore(
            { count: 0, name: "a" },
            { plugins: [guardPlugin<{ count: number; name: string }>([(payload) => ({ count: Math.max(0, payload.count ?? 0) })])] }
        );
        store.$patch({ count: -5 });
        expect(store.count.value).toBe(0);
        store.$patch({ count: 10 });
        expect(store.count.value).toBe(10);
    });

    it("composes multiple guards safely", () => {
        const store = createStore(
            { count: 0 },
            {
                plugins: [
                    guardPlugin<{ count: number }>([(payload) => ({ count: (payload.count ?? 0) + 1 })]),
                    guardPlugin<{ count: number }>([(payload) => ({ count: (payload.count ?? 0) * 2 })]),
                ],
            }
        );
        // $patch starts with 0, guard1 -> 0+1=1, guard2 -> 1*2=2
        store.$patch({ count: 0 });
        expect(store.count.value).toBe(2);
    });

    it("cleanup removes only its own guards", () => {
        const store = createStore({ count: 0 });
        const cleanup1 = guardPlugin<{ count: number }>([(payload) => ({ count: (payload.count ?? 0) + 1 })])(store) as () => void;
        guardPlugin<{ count: number }>([(payload) => ({ count: (payload.count ?? 0) * 2 })])(store);
        cleanup1();
        // With guard1 removed, only guard2 remains: 5 -> 5*2 = 10
        store.$patch({ count: 5 });
        expect(store.count.value).toBe(10);
    });

    it("runs guards on $reset", () => {
        const guard = vi.fn();
        const store = createStore(
            { count: 0 },
            { plugins: [guardPlugin<{ count: number }>([guard])] }
        );
        store.count.value = 5;
        store.$reset();
        expect(guard).toHaveBeenCalledWith({ count: 5 }, { count: 5 });
        expect(store.count.value).toBe(0);
    });
});
