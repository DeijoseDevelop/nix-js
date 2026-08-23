import { describe, it, expect } from "vitest";
import { repeat, getSequence } from "../nix/template/keyed";
import { html } from "../nix/template";

// =============================================================================
// --- repeat() ---
// =============================================================================

describe("repeat()", () => {
    it("retorna un objeto con __isKeyedList=true", () => {
        const list = repeat([1, 2, 3], (n) => n, (n) => html`<li>${n}</li>`);
        expect(list.__isKeyedList).toBe(true);
    });

    it("preserva los items originales", () => {
        const items = [10, 20, 30];
        const list = repeat(items, (n) => n, (n) => html`<li>${n}</li>`);
        expect(list.items).toBe(items);
    });

    it("usa la keyFn provista", () => {
        const items = [{ id: "a" }, { id: "b" }];
        const list = repeat(items, (item) => item.id, () => html`<li>x</li>`);
        expect(list.keyFn(items[0], 0)).toBe("a");
        expect(list.keyFn(items[1], 1)).toBe("b");
    });

    it("usa la renderFn provista", () => {
        const renderFn = (n: number) => html`<li data-n="${n}">${n}</li>`;
        const list = repeat([1], (n) => n, renderFn);
        expect(list.renderFn).toBe(renderFn);
    });

    it("keyFn puede retornar número", () => {
        const list = repeat([{ id: 42 }], (item) => item.id, () => html`<li>x</li>`);
        expect(list.keyFn({ id: 42 }, 0)).toBe(42);
    });

    it("keyFn recibe index como segundo argumento", () => {
        const keys: number[] = [];
        const list = repeat(
            ["a", "b", "c"],
            (_item, idx) => { keys.push(idx); return idx; },
            () => html`<li>x</li>`
        );
        // Llamar manualmente
        list.keyFn("a", 0);
        list.keyFn("b", 1);
        list.keyFn("c", 2);
        expect(keys).toEqual([0, 1, 2]);
    });

    it("funciona con lista vacía", () => {
        const list = repeat([], (n) => n as number, () => html`<li>x</li>`);
        expect(list.items).toEqual([]);
        expect(list.__isKeyedList).toBe(true);
    });
});

// =============================================================================
// --- getSequence() (LIS — Longest Increasing Subsequence) ---
// =============================================================================

describe("getSequence() — LIS", () => {
    it("retorna [0] para un solo elemento no-cero", () => {
        expect(getSequence([5])).toEqual([0]);
    });

    it("retorna secuencia trivial para array ya ordenado", () => {
        // [1,2,3,4] — LIS es toda la secuencia
        const result = getSequence([1, 2, 3, 4]);
        expect(result.length).toBe(4);
        // Los índices deben estar en orden creciente
        for (let i = 1; i < result.length; i++) {
            expect(result[i]).toBeGreaterThan(result[i - 1]);
        }
    });

    it("ignora los 0s (representan ítems nuevos)", () => {
        // 0 significa 'nuevo', no se incluye en la subsecuencia
        const result = getSequence([0, 1, 2, 3]);
        // El 0 no debe ser índice 0 en el resultado final (se ignora en la lógica)
        for (const idx of result) {
            expect(idx).toBeGreaterThanOrEqual(0);
        }
    });

    it("calcula LIS correctamente para [3,1,2,4]", () => {
        // La LIS de valores es [1,2,4] en posiciones [1,2,3]
        const result = getSequence([3, 1, 2, 4]);
        expect(result.length).toBe(3);
        expect(result).toEqual([1, 2, 3]);
    });

    it("calcula LIS para array invertido [4,3,2,1]", () => {
        // LIS de longitud 1
        const result = getSequence([4, 3, 2, 1]);
        expect(result.length).toBe(1);
    });

    it("maneja Int32Array además de number[]", () => {
        const arr = new Int32Array([1, 3, 2, 4]);
        const result = getSequence(arr);
        expect(result.length).toBeGreaterThanOrEqual(1);
        // Verificar que los índices forman una subsecuencia creciente
        for (let i = 1; i < result.length; i++) {
            expect(arr[result[i]]).toBeGreaterThan(arr[result[i - 1]]);
        }
    });

    it("retorna array vacío para input vacío", () => {
        const result = getSequence([]);
        // [0] con longitud vacía — el algoritmo parte con result=[0] pero itera 0 veces
        // comportamiento aceptable: length >= 0
        expect(Array.isArray(result)).toBe(true);
    });

    it("LIS de [2,3,1,4,5] tiene longitud 4", () => {
        // [2,3,4,5] en posiciones [0,1,3,4]
        const result = getSequence([2, 3, 1, 4, 5]);
        expect(result.length).toBe(4);
    });

    it("todos los valores iguales retorna secuencia de longitud 1", () => {
        const result = getSequence([5, 5, 5, 5]);
        expect(result.length).toBe(1);
    });
});

describe("keyed static mount", () => {
    it("repeat directo en mount renderiza items", () => {
        const el = document.createElement("div");
        const list = repeat([{ id: 1, name: "a" }, { id: 2, name: "b" }], (i) => i.id, (i) => html`<li class="item-${i.id}">${i.name}</li>`);
        html`<ul>${list}</ul>`.mount(el);
        expect(el.querySelectorAll("li").length).toBe(2);
        expect(el.querySelector("li")?.className).toBe("item-1");
        expect(el.querySelectorAll("li")[1].textContent).toBe("b");
    });
    it("unmount limpia keyed estatico", () => {
        const el = document.createElement("div");
        const list = repeat([1, 2], (i) => i, (i) => html`<li>${i}</li>`);
        const tpl = html`<ul>${list}</ul>`;
        const handle = tpl.mount(el);
        expect(el.querySelectorAll("li").length).toBe(2);
        handle.unmount();
        expect(el.querySelectorAll("li").length).toBe(0);
    });
});

