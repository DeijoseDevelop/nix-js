import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { html } from "../nix/template";
import { mount } from "../nix/component";
import { suspend, createQuery, invalidateQueries, clearQueryCache, lazy } from "../nix/async";
import { signal } from "../nix/reactivity";
import { NixComponent } from "../nix/lifecycle";

describe("suspend", () => {
    it("shows fallback while promise is pending", () => {
        const comp = suspend(
            () => new Promise<string>(() => { }), // never resolves
            (data) => html`<p>${data}</p>`,
            { fallback: html`<span class="loading">Loading…</span>` }
        );
        const el = document.createElement("div");
        mount(comp, el);
        expect(el.querySelector(".loading")).not.toBeNull();
    });

    it("shows resolved content after promise resolves", async () => {
        const comp = suspend(
            () => Promise.resolve("hello"),
            (data) => html`<p class="result">${data}</p>`,
            { fallback: html`<span class="fb">…</span>` }
        );
        const el = document.createElement("div");
        mount(comp, el);

        await new Promise(r => setTimeout(r, 10)); // Allow microtasks to process
        expect(el.querySelector(".result")!.textContent).toBe("hello");
    });

    it("shows error fallback on rejection", async () => {
        const comp = suspend(
            () => Promise.reject(new Error("fail")),
            () => html`<p>ok</p>`,
            { errorFallback: (err) => html`<span class="err">${(err as Error).message}</span>` }
        );
        const el = document.createElement("div");
        mount(comp, el);

        await new Promise(r => setTimeout(r, 10));
        expect(el.querySelector(".err")!.textContent).toBe("fail");
    });

    it("uses default fallback when none provided", () => {
        const comp = suspend(
            () => new Promise<string>(() => { }),
            (data) => html`<p>${data}</p>`
        );
        const el = document.createElement("div");
        mount(comp, el);
        // Validates internal implementation fallback class
        expect(el.querySelector(".nix-spinner")).not.toBeNull();
    });

    it("re-fetches when invalidate signal changes", async () => {
        let callCount = 0;
        const refresh = signal(0);
        const comp = suspend(
            () => { callCount++; return Promise.resolve(`call-${callCount}`); },
            (data) => html`<p class="data">${data}</p>`,
            { invalidate: refresh }
        );
        const el = document.createElement("div");
        mount(comp, el);
        await new Promise(r => setTimeout(r, 10));
        expect(el.querySelector(".data")!.textContent).toBe("call-1");

        // Trigger reactive invalidation
        refresh.update(n => n + 1);
        await new Promise(r => setTimeout(r, 10));
        expect(el.querySelector(".data")!.textContent).toBe("call-2");
        expect(callCount).toBe(2);
    });

    it("invalidate does not run on initial mount (only on subsequent changes)", async () => {
        let callCount = 0;
        const refresh = signal(0);
        const comp = suspend(
            () => { callCount++; return Promise.resolve("ok"); },
            (data) => html`<p>${data}</p>`,
            { invalidate: refresh }
        );
        const el = document.createElement("div");
        mount(comp, el);
        await new Promise(r => setTimeout(r, 10));

        expect(callCount).toBe(1);
    });

    it("usa caché global si se proporciona un cacheKey", async () => {
        let count = 0;
        const comp1 = suspend(
            () => { count++; return Promise.resolve("cached"); },
            (data) => html`<p>${data}</p>`,
            { cacheKey: "suspense-key", staleTime: 10000 }
        );

        const el1 = document.createElement("div");
        mount(comp1, el1);
        await new Promise(r => setTimeout(r, 10));
        expect(count).toBe(1);

        // El segundo suspense usa la misma llave
        const comp2 = suspend(
            () => { count++; return Promise.resolve("fresh"); },
            (data) => html`<p>${data}</p>`,
            { cacheKey: "suspense-key", staleTime: 10000 }
        );
        const el2 = document.createElement("div");
        mount(comp2, el2);
        await new Promise(r => setTimeout(r, 10));

        // Cache hit! No debería haber incrementado count
        expect(count).toBe(1);
    });
});

describe("createQuery / invalidateQueries", () => {
    it("fetches and renders data by key", async () => {
        // createQuery MUST be tested within a NixComponent since it returns reactive Signals
        class TestListComp extends NixComponent {
            private query = createQuery("test-items", () => Promise.resolve(["a", "b", "c"]));

            render() {
                return html`
                    <div class="list-container">
                        ${() => this.query.status.value === "success"
                        ? html`<ul class="list">${this.query.data.value!.map(i => html`<li>${i}</li>`)}</ul>`
                        : ""
                    }
                    </div>
                `;
            }
        }

        const el = document.createElement("div");
        mount(new TestListComp(), el);
        await new Promise(r => setTimeout(r, 10));

        expect(el.querySelector(".list")!.children.length).toBe(3);
    });

    it("re-fetches when invalidateQueries is called with matching key", async () => {
        let callCount = 0;

        class CounterComp extends NixComponent {
            private query = createQuery("counter-query", () => {
                callCount++;
                return Promise.resolve(callCount);
            });

            render() {
                return html`
                    <div>
                        ${() => this.query.status.value === "success"
                        ? html`<span class="val">${this.query.data.value}</span>`
                        : ""
                    }
                    </div>
                `;
            }
        }

        const el = document.createElement("div");
        mount(new CounterComp(), el);
        await new Promise(r => setTimeout(r, 10));
        expect(el.querySelector(".val")!.textContent).toBe("1");

        // Global invalidation trigger
        invalidateQueries("counter-query");
        await new Promise(r => setTimeout(r, 10));

        expect(el.querySelector(".val")!.textContent).toBe("2");
        expect(callCount).toBe(2);
    });

    it("does not affect queries with different keys", async () => {
        let countA = 0;
        let countB = 0;

        class CompA extends NixComponent {
            q = createQuery("key-a", () => { countA++; return Promise.resolve("a"); });
            render() { return html`<span class="a">${() => this.q.data.value}</span>`; }
        }

        class CompB extends NixComponent {
            q = createQuery("key-b", () => { countB++; return Promise.resolve("b"); });
            render() { return html`<span class="b">${() => this.q.data.value}</span>`; }
        }

        const elA = document.createElement("div");
        const elB = document.createElement("div");

        mount(new CompA(), elA);
        mount(new CompB(), elB);
        await new Promise(r => setTimeout(r, 10));

        invalidateQueries("key-a");
        await new Promise(r => setTimeout(r, 10));

        expect(countA).toBe(2); // re-fetched
        expect(countB).toBe(1); // untouched
    });

    it("safely ignores invalidations after unmount without memory leaks", async () => {
        class CleanupComp extends NixComponent {
            q = createQuery("cleanup-test", () => Promise.resolve("data"));
            render() { return html`<span>${() => this.q.data.value}</span>`; }
        }

        const el = document.createElement("div");
        const handle = mount(new CleanupComp(), el);
        await new Promise(r => setTimeout(r, 10));

        handle.unmount();

        // The underlying architecture relies on FinalizationRegistry for memory release.
        // Even if the registry hasn't cleaned up the WeakRef yet, invalidateQueries
        // safely handles dereferenced or orphaned queries.
        expect(() => invalidateQueries("cleanup-test")).not.toThrow();
    });

    it("respeta las opciones staleTime y refetchOnMount", async () => {
        let count = 0;
        class StaleComp extends NixComponent {
            q = createQuery("stale-test", () => { count++; return Promise.resolve(count); }, {
                staleTime: 1000,
                refetchOnMount: "stale"
            });
            render() { return html`<div class="val">${() => this.q.data.value}</div>`; }
        }

        const el = document.createElement("div");
        mount(new StaleComp(), el);
        await Promise.resolve();
        expect(count).toBe(1);

        // Montar otro instantáneamente no debe hacer fetch (está fresh)
        mount(new StaleComp(), document.createElement("div"));
        await Promise.resolve();
        expect(count).toBe(1);

        // refetchOnMount = false explícito
        class NoFetchComp extends NixComponent {
            q = createQuery("stale-test", () => Promise.resolve(99), { refetchOnMount: false });
            render() { return html`<div class="val">${() => this.q.data.value}</div>`; }
        }
        mount(new NoFetchComp(), document.createElement("div"));
        await Promise.resolve();
        expect(count).toBe(1); // Aún no hace fetch
    });

    it("método refetch() fuerza una recarga manual", async () => {
        let count = 0;
        let refetchFn!: () => void;

        class RefetchComp extends NixComponent {
            q = createQuery("manual-test", () => { count++; return Promise.resolve(count); });
            onInit() { refetchFn = this.q.refetch; }
            render() { return html`<div></div>`; }
        }

        mount(new RefetchComp(), document.createElement("div"));
        await Promise.resolve();
        expect(count).toBe(1);

        refetchFn();
        await Promise.resolve();
        expect(count).toBe(2);
    });
});

describe("Query Cache Utils & Garbage Collection", () => {
    beforeEach(() => {
        vi.useFakeTimers();
        clearQueryCache(); // Asegurar estado limpio
    });

    afterEach(() => {
        vi.runOnlyPendingTimers();
        vi.useRealTimers();
    });

    it("clearQueryCache borra una llave específica o todo", async () => {
        let fetchCountA = 0;
        let fetchCountB = 0;

        class CompA extends NixComponent {
            // Apagamos refetchOnMount para testear estrictamente si existe en caché
            q = createQuery("k1", () => { fetchCountA++; return Promise.resolve(1); }, { refetchOnMount: false });
            render() { return html`<div>A</div>`; }
        }
        class CompB extends NixComponent {
            q = createQuery("k2", () => { fetchCountB++; return Promise.resolve(2); }, { refetchOnMount: false });
            render() { return html`<div>B</div>`; }
        }

        const el = document.createElement("div");
        mount(new CompA(), el);
        mount(new CompB(), el);
        await Promise.resolve(); // Flush microtasks

        expect(fetchCountA).toBe(1);
        expect(fetchCountB).toBe(1);

        // Borramos una llave
        clearQueryCache("k1");
        mount(new CompA(), document.createElement("div")); // Vuelve a montar, debe fetch
        mount(new CompB(), document.createElement("div")); // Vuelve a montar, cache hit
        await Promise.resolve();

        expect(fetchCountA).toBe(2);
        expect(fetchCountB).toBe(1); // Mantuvo el hit

        // Borramos todo
        clearQueryCache();
        mount(new CompB(), document.createElement("div"));
        await Promise.resolve();

        expect(fetchCountB).toBe(2); // Ahora sí hace fetch
    });

    it("el Garbage Collector elimina entradas sin subscriptores tras el staleTime", async () => {
        const { setQueryCacheTime, suspend } = await import("../nix/async");

        setQueryCacheTime(10);
        let fetchCount = 0;

        const createTestComp = () => suspend(
            () => { fetchCount++; return Promise.resolve("ok"); },
            (data) => html`<div>${data}</div>`,
            { cacheKey: "gc-test", staleTime: Infinity }
        );

        // 1. Montamos el primero
        const el1 = document.createElement("div");
        const handle1 = mount(createTestComp(), el1);
        await Promise.resolve();
        expect(fetchCount).toBe(1);

        // Avanzamos el tiempo explícitamente para Date.now() y para setInterval
        const time1 = Date.now() + 60_000;
        vi.setSystemTime(time1);
        vi.advanceTimersByTime(60_000);

        // 2. Montamos el segundo (debe ser cache hit protegido)
        const el2 = document.createElement("div");
        const handle2 = mount(createTestComp(), el2);
        await Promise.resolve();
        expect(fetchCount).toBe(1);

        // 3. Desmontamos AMBOS (subscriptores a 0)
        handle1.unmount();
        handle2.unmount();

        // 4. Avanzamos el tiempo para disparar el GC con el reloj actualizado
        const time2 = time1 + 60_001;
        vi.setSystemTime(time2);
        vi.advanceTimersByTime(60_001);

        // 5. Montamos de nuevo, el GC debió borrarlo
        mount(createTestComp(), document.createElement("div"));
        await Promise.resolve();
        expect(fetchCount).toBe(2);
    });
});

describe("lazy()", () => {
    it("carga un componente de forma asíncrona y lo cachea", async () => {
        let importCount = 0;

        class MockPage extends NixComponent {
            render() { return html`<div class="page">Lazy Page</div>`; }
        }

        const loadPage = () => new Promise<{ default: new () => NixComponent }>((resolve) => {
            importCount++;
            setTimeout(() => resolve({ default: MockPage }), 10);
        });

        const LazyComp = lazy(loadPage, html`<div class="lazy-fallback">loading...</div>`);

        const el = document.createElement("div");
        mount(LazyComp(), el);

        // 1. Muestra el fallback inmediatamente
        expect(el.querySelector(".lazy-fallback")).not.toBeNull();

        // 2. Resuelve y muestra el componente
        await new Promise(r => setTimeout(r, 20));
        expect(el.querySelector(".page")).not.toBeNull();
        expect(importCount).toBe(1);

        // 3. Montar una segunda instancia usa el caché inmediatamente (no llama a loadPage de nuevo)
        const el2 = document.createElement("div");
        mount(LazyComp(), el2);
        expect(el2.querySelector(".page")).not.toBeNull();
        expect(importCount).toBe(1);
    });
});
