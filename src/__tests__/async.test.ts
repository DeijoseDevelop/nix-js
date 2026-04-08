import { describe, it, expect, vi } from "vitest";
import { html } from "../nix/template";
import { mount } from "../nix/component";
import { suspend, lazy } from "../nix/async";
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

    it("uses default error fallback and stringifies non-Error values", async () => {
        const comp = suspend(
            () => Promise.reject(404),
            () => html`<p>ok</p>`
        );
        const el = document.createElement("div");
        mount(comp, el);

        await new Promise(r => setTimeout(r, 10));
        expect(el.textContent).toContain("404");
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

    it("evicts suspense cache entries via GC when unused", async () => {
        vi.useFakeTimers();
        try {
            let count = 0;
            const key = "gc-key";

            const comp1 = suspend(
                () => { count++; return Promise.resolve(`v${count}`); },
                (data) => html`<p>${data}</p>`,
                { cacheKey: key, staleTime: 1_000_000 }
            );

            const el1 = document.createElement("div");
            const h1 = mount(comp1, el1);
            await Promise.resolve();
            await Promise.resolve();
            expect(count).toBe(1);

            h1.unmount();

            // Advance enough time for cache TTL + GC interval.
            await vi.advanceTimersByTimeAsync(6 * 60 * 1000);

            const comp2 = suspend(
                () => { count++; return Promise.resolve(`v${count}`); },
                (data) => html`<p>${data}</p>`,
                { cacheKey: key, staleTime: 1_000_000 }
            );

            const el2 = document.createElement("div");
            const h2 = mount(comp2, el2);
            await Promise.resolve();
            await Promise.resolve();

            // If GC removed cache entry, a new fetch is required.
            expect(count).toBe(2);
            h2.unmount();
        } finally {
            vi.useRealTimers();
        }
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

    it("stale cache triggers fetch path on mount", async () => {
        let count = 0;
        const key = "stale-cache-key";

        const comp1 = suspend(
            () => { count++; return Promise.resolve(`v${count}`); },
            (data) => html`<p class="data">${data}</p>`,
            { cacheKey: key, staleTime: 1 }
        );

        const el1 = document.createElement("div");
        const h1 = mount(comp1, el1);
        await new Promise(r => setTimeout(r, 10));
        expect(count).toBe(1);
        h1.unmount();

        await new Promise(r => setTimeout(r, 5));

        const comp2 = suspend(
            () => { count++; return Promise.resolve(`v${count}`); },
            (data) => html`<p class="data">${data}</p>`,
            { cacheKey: key, staleTime: 1 }
        );

        const el2 = document.createElement("div");
        mount(comp2, el2);
        await new Promise(r => setTimeout(r, 10));
        expect(count).toBe(2);
    });

    it("runs unmount cleanup for invalidate watcher and cache subscribers", async () => {
        let count = 0;
        const refresh = signal(0);
        const comp = suspend(
            () => { count++; return Promise.resolve("ok"); },
            (data) => html`<p class="data">${data}</p>`,
            { invalidate: refresh, cacheKey: "cleanup-key", staleTime: 10_000 }
        );

        const el = document.createElement("div");
        const handle = mount(comp, el);
        await new Promise(r => setTimeout(r, 10));
        expect(count).toBe(1);

        handle.unmount();

        // The invalidate effect should be disposed after unmount.
        refresh.update(n => n + 1);
        await new Promise(r => setTimeout(r, 10));
        expect(count).toBe(1);
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
