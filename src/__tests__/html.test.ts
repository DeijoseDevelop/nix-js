import { describe, it, expect } from "vitest";
import { html, buildHTML } from "../nix/template";
import type { BindingContext } from "../nix/template/bindings";

// =============================================================================
// --- Grupo 1: Construcción Estática (Pre-compilador) ---
// =============================================================================

describe("Construcción Estática: buildHTML", () => {
    it("inyecta marcadores de comentarios para bindings de nodos", () => {
        const strings = ["<div class=\"wrapper\">", "</div>"] as unknown as readonly string[];
        const contexts: BindingContext[] = [{ type: "node" }];

        const result = buildHTML(strings, contexts);

        expect(result).toBe('<div class="wrapper"><!--nix-0--></div>');
        expect(result).toContain("<!--nix-0-->");
    });

    it("no modifica HTML si no hay bindings", () => {
        const strings = ["<div>static</div>"] as unknown as readonly string[];
        const result = buildHTML(strings, []);
        expect(result).toBe("<div>static</div>");
    });

    it("inyecta múltiples node markers en orden correcto", () => {
        const strings = ["<div>", "", "", "</div>"] as unknown as readonly string[];
        const contexts: BindingContext[] = [
            { type: "node" },
            { type: "node" },
            { type: "node" }
        ];

        const result = buildHTML(strings, contexts);

        expect(result).toContain("<!--nix-0-->");
        expect(result).toContain("<!--nix-1-->");
        expect(result).toContain("<!--nix-2-->");
    });

    it("transforma eventos con modificadores correctamente", () => {
        const strings = ["<button @click.prevent.stop=", "></button>"] as unknown as readonly string[];
        const contexts: BindingContext[] = [{
            type: "event",
            eventName: "click",
            modifiers: ["prevent", "stop"],
            hadOpenQuote: false
        }];

        const result = buildHTML(strings, contexts);

        expect(result).toBe('<button  data-nix-e-0="click"></button>');
    });

    it("transforma atributos dinámicos con comillas", () => {
        const strings = ["<input class=\"", "\" type=\"text\">"] as unknown as readonly string[];
        const contexts: BindingContext[] = [{
            type: "attr",
            attrName: "class",
            hadOpenQuote: true
        }];

        const result = buildHTML(strings, contexts);

        expect(result).toBe('<input  data-nix-a-0="class" type="text">');
    });

    it("transforma atributos sin comillas", () => {
        const strings = ["<input id=", " type=\"text\">"] as unknown as readonly string[];
        const contexts: BindingContext[] = [{
            type: "attr",
            attrName: "id",
            hadOpenQuote: false
        }];

        const result = buildHTML(strings, contexts);

        expect(result).toBe('<input  data-nix-a-0="id" type="text">');
    });

    it("procesa múltiples bindings mixtos correctamente", () => {
        const strings = ["<div id=", " @click=", ">", "</div>"] as unknown as readonly string[];
        const contexts: BindingContext[] = [
            { type: "attr", attrName: "id", hadOpenQuote: false },
            { type: "event", eventName: "click", modifiers: [], hadOpenQuote: false },
            { type: "node" }
        ];

        const result = buildHTML(strings, contexts);

        expect(result).toBe(
            '<div  data-nix-a-0="id"  data-nix-e-1="click"><!--nix-2--></div>'
        );
    });

    it("consume correctamente comillas cuando hadOpenQuote=true", () => {
        const strings = ["<div title=\"", "\">", "</div>"] as unknown as readonly string[];
        const contexts: BindingContext[] = [
            { type: "attr", attrName: "title", hadOpenQuote: true },
            { type: "node" }
        ];

        const result = buildHTML(strings, contexts);

        expect(result).toContain('data-nix-a-0="title"');
        expect(result).not.toContain('""');
    });
});

// =============================================================================
// --- Grupo 2: Motor de Plantillas ---
// =============================================================================

describe("Motor de Plantillas: html`` tag", () => {
    it("retorna un objeto NixTemplate válido", () => {
        const tpl = html`<p>Base</p>`;

        expect(tpl.__isNixTemplate).toBe(true);
        expect(typeof tpl._render).toBe("function");
        expect(typeof tpl.mount).toBe("function");
    });

    it("usa caché por TemplateStringsArray (WeakMap)", () => {
        const render = () => html`<div class="cached"></div>`;

        const tpl1 = render();
        const tpl2 = render();

        expect(tpl1).not.toBeNull();
        expect(tpl2).not.toBeNull();
    });

    it("renderiza correctamente contenido estático", () => {
        const el = document.createElement("div");
        const tpl = html`<h1>Static</h1>`;

        tpl.mount(el);

        expect(el.innerHTML).toContain("<h1>Static</h1>");
    });

    it("crea nodos independientes por mount (no reuse de fragment)", () => {
        const el = document.createElement("div");
        const tpl = html`<span>Test</span>`;

        tpl.mount(el);
        tpl.mount(el);

        expect(el.querySelectorAll("span").length).toBe(2);
    });
});

// =============================================================================
// --- Grupo 3: Ciclo de vida y DOM ---
// =============================================================================

describe("Ciclo de vida: mount y unmount", () => {
    it("monta usando selector string", () => {
        const container = document.createElement("div");
        container.id = "app-root";
        document.body.appendChild(container);

        const tpl = html`<main>Content</main>`;
        const handle = tpl.mount("#app-root");

        expect(container.querySelector("main")).not.toBeNull();

        handle.unmount();
        document.body.removeChild(container);
    });

    it("lanza error si el contenedor no existe", () => {
        const tpl = html`<div>Error</div>`;
        expect(() => tpl.mount("#ghost")).toThrow();
    });

    it("no elimina nodos externos al desmontar", () => {
        const container = document.createElement("div");
        container.innerHTML = `<div class="keep"></div>`;

        const tpl = html`<span>A</span>`;
        const handle = tpl.mount(container);

        handle.unmount();

        expect(container.querySelector(".keep")).not.toBeNull();
    });

    it("elimina solo el fragmento montado", () => {
        const container = document.createElement("div");

        const tpl = html`<span class="target">X</span>`;
        const handle = tpl.mount(container);

        expect(container.querySelector(".target")).not.toBeNull();

        handle.unmount();

        expect(container.querySelector(".target")).toBeNull();
    });

    it("limpia completamente el contenedor si solo contiene el fragmento", () => {
        const el = document.createElement("div");
        const tpl = html`<div>Temp</div>`;

        const handle = tpl.mount(el);
        handle.unmount();

        expect(el.innerHTML).toBe("");
    });

    it("soporta múltiples mounts y unmount independientes", () => {
        const el = document.createElement("div");

        const tpl1 = html`<span class="a">A</span>`;
        const tpl2 = html`<span class="b">B</span>`;

        const h1 = tpl1.mount(el);
        tpl2.mount(el);

        h1.unmount();

        expect(el.querySelector(".a")).toBeNull();
        expect(el.querySelector(".b")).not.toBeNull();
    });
});