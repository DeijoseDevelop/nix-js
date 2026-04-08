import { describe, it, expect } from "vitest";
import { isNixTemplate, isKeyedList, ref, COMMENT } from "../nix/template/types";
import { html } from "../nix/template";
import { repeat } from "../nix/template/keyed";

// =============================================================================
// --- isNixTemplate ---
// =============================================================================

describe("isNixTemplate()", () => {
    it("retorna true para un NixTemplate real (html``)", () => {
        const tpl = html`<div>x</div>`;
        expect(isNixTemplate(tpl)).toBe(true);
    });

    it("retorna true para un objeto con __isNixTemplate=true", () => {
        const fake = { __isNixTemplate: true };
        expect(isNixTemplate(fake)).toBe(true);
    });

    it("retorna false para null", () => {
        expect(isNixTemplate(null)).toBe(false);
    });

    it("retorna false para undefined", () => {
        expect(isNixTemplate(undefined)).toBe(false);
    });

    it("retorna false para un string", () => {
        expect(isNixTemplate("hello")).toBe(false);
    });

    it("retorna false para un número", () => {
        expect(isNixTemplate(42)).toBe(false);
    });

    it("retorna false para un objeto sin la propiedad", () => {
        expect(isNixTemplate({ type: "something" })).toBe(false);
    });

    it("retorna false para un objeto con __isNixTemplate=false", () => {
        expect(isNixTemplate({ __isNixTemplate: false })).toBe(false);
    });

    it("retorna false para un array", () => {
        expect(isNixTemplate([])).toBe(false);
    });
});

// =============================================================================
// --- isKeyedList ---
// =============================================================================

describe("isKeyedList()", () => {
    it("retorna true para un KeyedList real (repeat())", () => {
        const list = repeat([1, 2], n => n, (n) => html`<li>${n as any}</li>`);
        expect(isKeyedList(list)).toBe(true);
    });

    it("retorna true para un objeto con __isKeyedList=true", () => {
        const fake = { __isKeyedList: true };
        expect(isKeyedList(fake)).toBe(true);
    });

    it("retorna false para null", () => {
        expect(isKeyedList(null)).toBe(false);
    });

    it("retorna false para undefined", () => {
        expect(isKeyedList(undefined)).toBe(false);
    });

    it("retorna false para un NixTemplate", () => {
        const tpl = html`<div>x</div>`;
        expect(isKeyedList(tpl)).toBe(false);
    });

    it("retorna false para un array vacío", () => {
        expect(isKeyedList([])).toBe(false);
    });

    it("retorna false para un objeto con __isKeyedList=false", () => {
        expect(isKeyedList({ __isKeyedList: false })).toBe(false);
    });
});

// =============================================================================
// --- ref() ---
// =============================================================================

describe("ref()", () => {
    it("crea un ref con el valor inicial null", () => {
        const r = ref();
        expect(r.el).toBeNull();
    });

    it("es tipado genéricamente — acepta HTMLInputElement", () => {
        const r = ref<HTMLInputElement>();
        expect(r.el).toBeNull();
    });

    it("cada llamada crea un objeto distinto", () => {
        const r1 = ref();
        const r2 = ref();
        expect(r1).not.toBe(r2);
    });

    it("el ref es asignable (el no es readonly)", () => {
        const r = ref<HTMLDivElement>();
        const div = document.createElement("div");
        r.el = div;
        expect(r.el).toBe(div);
    });

    it("se puede resetear a null", () => {
        const r = ref<HTMLDivElement>();
        r.el = document.createElement("div");
        r.el = null;
        expect(r.el).toBeNull();
    });
});

// =============================================================================
// --- COMMENT constants ---
// =============================================================================

describe("COMMENT constants", () => {
    it("SCOPE es un string no vacío", () => {
        expect(typeof COMMENT.SCOPE).toBe("string");
        expect(COMMENT.SCOPE.length).toBeGreaterThan(0);
    });

    it("ERROR_BOUNDARY es un string no vacío", () => {
        expect(typeof COMMENT.ERROR_BOUNDARY).toBe("string");
        expect(COMMENT.ERROR_BOUNDARY.length).toBeGreaterThan(0);
    });

    it("TRANSITION es un string no vacío", () => {
        expect(typeof COMMENT.TRANSITION).toBe("string");
        expect(COMMENT.TRANSITION.length).toBeGreaterThan(0);
    });

    it("todas las constantes son únicas entre sí", () => {
        const values = Object.values(COMMENT);
        const unique = new Set(values);
        expect(unique.size).toBe(values.length);
    });

    it("KEYED_START y KEYED_END son distintos", () => {
        expect(COMMENT.KEYED_START).not.toBe(COMMENT.KEYED_END);
    });
});
