import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { html } from "../nix/template";
import { sanitizeUrl, isUrlAttrName, isExecutableAttrName } from "../nix/template/sanitize";
import { signal, nextTick } from "../nix/reactivity";

// =============================================================================
// --- Unit: sanitizeUrl ---
// =============================================================================

describe("sanitizeUrl", () => {
    it("permite URLs http/https/relativas/anclas", () => {
        expect(sanitizeUrl("https://example.com")).toBe("https://example.com");
        expect(sanitizeUrl("http://example.com")).toBe("http://example.com");
        expect(sanitizeUrl("/about")).toBe("/about");
        expect(sanitizeUrl("#section")).toBe("#section");
        expect(sanitizeUrl("mailto:a@b.com")).toBe("mailto:a@b.com");
        expect(sanitizeUrl("tel:+123")).toBe("tel:+123");
        expect(sanitizeUrl("../rel/path")).toBe("../rel/path");
    });

    it("bloquea javascript:", () => {
        expect(sanitizeUrl("javascript:alert(1)")).toBe("");
        expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBe("");
    });

    it("bloquea vbscript:, livescript:, mocha:", () => {
        expect(sanitizeUrl("vbscript:msgbox(1)")).toBe("");
        expect(sanitizeUrl("livescript:foo")).toBe("");
        expect(sanitizeUrl("mocha:foo")).toBe("");
    });

    it("bloquea esquemas ofuscados con espacios y caracteres de control", () => {
        expect(sanitizeUrl("  javascript:alert(1)")).toBe("");
        expect(sanitizeUrl("java\tscript:alert(1)")).toBe("");
        expect(sanitizeUrl("java\nscript:alert(1)")).toBe("");
        expect(sanitizeUrl("\u0000javascript:alert(1)")).toBe("");
        expect(sanitizeUrl("\uFEFFjavascript:alert(1)")).toBe("");
    });

    it("bloquea data:text/html y data:image/svg+xml", () => {
        expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBe("");
        expect(sanitizeUrl("data:image/svg+xml,<svg onload=alert(1)>")).toBe("");
    });

    it("permite data:image raster seguro", () => {
        const png = "data:image/png;base64,iVBORw0KGgo=";
        expect(sanitizeUrl(png)).toBe(png);
        const jpg = "data:image/jpeg;base64,/9j/4AAQ=";
        expect(sanitizeUrl(jpg)).toBe(jpg);
    });
});

describe("isUrlAttrName / isExecutableAttrName", () => {
    it("clasifica atributos de URL", () => {
        expect(isUrlAttrName("href")).toBe(true);
        expect(isUrlAttrName("src")).toBe(true);
        expect(isUrlAttrName("formaction")).toBe(true);
        expect(isUrlAttrName("XLINK:HREF")).toBe(true);
    });

    it("NO clasifica como URL atributos comunes ni personalizados", () => {
        expect(isUrlAttrName("class")).toBe(false);
        expect(isUrlAttrName("style")).toBe(false);
        expect(isUrlAttrName("aria-label")).toBe(false);
        expect(isUrlAttrName("data-id")).toBe(false);
        expect(isUrlAttrName("disabled")).toBe(false);
    });

    it("detecta atributos ejecutables", () => {
        expect(isExecutableAttrName("onclick")).toBe(true);
        expect(isExecutableAttrName("onerror")).toBe(true);
        expect(isExecutableAttrName("srcdoc")).toBe(true);
        expect(isExecutableAttrName("class")).toBe(false);
        expect(isExecutableAttrName("aria-label")).toBe(false);
    });
});

// =============================================================================
// --- Integration: html`` attribute bindings ---
// =============================================================================

describe("html``: saneamiento de URL en atributos", () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {}); });
    afterEach(() => { warnSpy.mockRestore(); });

    it("bloquea href javascript: (valor estático)", () => {
        const el = document.createElement("div");
        html`<a href=${"javascript:alert(1)"}>x</a>`.mount(el);
        expect(el.querySelector("a")!.getAttribute("href")).toBe("");
    });

    it("permite href https legítimo", () => {
        const el = document.createElement("div");
        html`<a href=${"https://example.com"}>x</a>`.mount(el);
        expect(el.querySelector("a")!.getAttribute("href")).toBe("https://example.com");
    });

    it("bloquea href javascript: en update reactivo", async () => {
        const el = document.createElement("div");
        const url = signal("/safe");
        html`<a href=${() => url.value}>x</a>`.mount(el);
        expect(el.querySelector("a")!.getAttribute("href")).toBe("/safe");

        url.value = "javascript:alert(1)";
        await nextTick();
        expect(el.querySelector("a")!.getAttribute("href")).toBe("");
    });

    it("no sanea ni altera atributos que no son URL (aria-*, class)", () => {
        const el = document.createElement("div");
        html`<div class=${"a b"} aria-label=${"hola"}></div>`.mount(el);
        const div = el.querySelector("div")!;
        expect(div.getAttribute("class")).toBe("a b");
        expect(div.getAttribute("aria-label")).toBe("hola");
    });

    it("permite data:image en src", () => {
        const el = document.createElement("div");
        const png = "data:image/png;base64,iVBORw0KGgo=";
        html`<img src=${png}>`.mount(el);
        expect(el.querySelector("img")!.getAttribute("src")).toBe(png);
    });

    it("advierte (sin bloquear el render) en atributo ejecutable", () => {
        const el = document.createElement("div");
        html`<div onclick=${"steal()"}></div>`.mount(el);
        expect(warnSpy).toHaveBeenCalled();
    });
});
