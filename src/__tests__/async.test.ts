import { describe, it, expect } from "vitest";
import { html } from "../nix/template";
import { mount } from "../nix/component";
import { suspend } from "../nix/async";

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
});
