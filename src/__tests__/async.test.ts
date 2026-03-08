import { describe, it, expect } from "vitest";
import { html } from "../nix/template";
import { mount } from "../nix/component";
import { suspend, createQuery, invalidateQueries } from "../nix/async";
import { signal } from "../nix/reactivity";

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
        // wait for microtask
        await new Promise(r => setTimeout(r, 10));
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
        // default fallback has .nix-spinner
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

        // Trigger re-fetch via invalidate
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
        // Only 1 call from onMount, not 2
        expect(callCount).toBe(1);
    });
});

describe("createQuery / invalidateQueries", () => {
    it("fetches and renders data by key", async () => {
        const comp = createQuery(
            "test-items",
            () => Promise.resolve(["a", "b", "c"]),
            (items) => html`<ul class="list">${items.map(i => html`<li>${i}</li>`)}</ul>`,
        );
        const el = document.createElement("div");
        mount(comp, el);
        await new Promise(r => setTimeout(r, 10));
        expect(el.querySelector(".list")!.children.length).toBe(3);
    });

    it("re-fetches when invalidateQueries is called with matching key", async () => {
        let callCount = 0;
        const comp = createQuery(
            "counter-query",
            () => { callCount++; return Promise.resolve(callCount); },
            (n) => html`<span class="val">${n}</span>`,
        );
        const el = document.createElement("div");
        mount(comp, el);
        await new Promise(r => setTimeout(r, 10));
        expect(el.querySelector(".val")!.textContent).toBe("1");

        invalidateQueries("counter-query");
        await new Promise(r => setTimeout(r, 10));
        expect(el.querySelector(".val")!.textContent).toBe("2");
        expect(callCount).toBe(2);
    });

    it("does not affect queries with different keys", async () => {
        let countA = 0;
        let countB = 0;

        const compA = createQuery(
            "key-a",
            () => { countA++; return Promise.resolve("a"); },
            (d) => html`<span class="a">${d}</span>`,
        );
        const compB = createQuery(
            "key-b",
            () => { countB++; return Promise.resolve("b"); },
            (d) => html`<span class="b">${d}</span>`,
        );

        const elA = document.createElement("div");
        const elB = document.createElement("div");
        mount(compA, elA);
        mount(compB, elB);
        await new Promise(r => setTimeout(r, 10));

        invalidateQueries("key-a");
        await new Promise(r => setTimeout(r, 10));

        expect(countA).toBe(2); // re-fetched
        expect(countB).toBe(1); // untouched
    });

    it("cleans up registry on unmount", async () => {
        const comp = createQuery(
            "cleanup-test",
            () => Promise.resolve("data"),
            (d) => html`<span>${d}</span>`,
        );
        const el = document.createElement("div");
        const handle = mount(comp, el);
        await new Promise(r => setTimeout(r, 10));

        handle.unmount();

        // After unmount, invalidating should be a no-op (no errors)
        invalidateQueries("cleanup-test");
    });
});
