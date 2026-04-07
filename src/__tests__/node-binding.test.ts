import { describe, it, expect, vi, beforeEach } from "vitest";
import { html } from "../nix/template";
import { repeat } from "../nix/template/keyed";
import { signal, nextTick } from "../nix/reactivity";

// =============================================================================
// --- Nodos: valores estáticos ---
// =============================================================================

describe("Node binding: valores estáticos", () => {
    it("renderiza un string estático", () => {
        const el = document.createElement("div");
        html`<p>${"Hola"}</p>`.mount(el);
        expect(el.querySelector("p")!.textContent).toBe("Hola");
    });

    it("renderiza un número estático", () => {
        const el = document.createElement("div");
        html`<p>${42}</p>`.mount(el);
        expect(el.querySelector("p")!.textContent).toBe("42");
    });

    it("no renderiza null", () => {
        const el = document.createElement("div");
        html`<div>${null}</div>`.mount(el);
        expect(el.querySelector("div")!.textContent).toBe("");
    });

    it("no renderiza false", () => {
        const el = document.createElement("div");
        html`<div>${false}</div>`.mount(el);
        expect(el.querySelector("div")!.textContent).toBe("");
    });

    it("renderiza un NixTemplate anidado", () => {
        const el = document.createElement("div");
        html`<div>${html`<span class="inner">X</span>`}</div>`.mount(el);
        expect(el.querySelector(".inner")).not.toBeNull();
    });

    it("renderiza un array de strings", () => {
        const el = document.createElement("div");
        html`<ul>${["a", "b", "c"]}</ul>`.mount(el);
        expect(el.querySelector("ul")!.textContent).toBe("abc");
    });

    it("renderiza un array de NixTemplates", () => {
        const el = document.createElement("div");
        const items = [html`<li>1</li>`, html`<li>2</li>`];
        html`<ul>${items}</ul>`.mount(el);
        expect(el.querySelectorAll("li").length).toBe(2);
    });

    it("renderiza un array mixto (strings + templates)", () => {
        const el = document.createElement("div");
        html`<div>${["text", html`<span>tpl</span>`]}</div>`.mount(el);
        expect(el.textContent).toContain("text");
        expect(el.querySelector("span")).not.toBeNull();
    });

    it("no renderiza null ni false dentro de un array estático", () => {
        const el = document.createElement("div");
        html`<ul>${["a", null, "b", false, "c"]}</ul>`.mount(el);
        expect(el.querySelector("ul")!.textContent).toBe("abc");
    });

    it("renderiza un NixComponent estático dentro del template", () => {
        const el = document.createElement("div");
        const comp = {
            __isNixComponent: true as const,
            render: () => html`<span class="comp">Comp</span>`
        };
        html`<div>${comp as any}</div>`.mount(el);
        expect(el.querySelector(".comp")).not.toBeNull();
    });

    it("renderiza un array de NixComponents estáticos", () => {
        const el = document.createElement("div");
        const makeComp = (name: string) => ({
            __isNixComponent: true as const,
            render: () => html`<li class="comp">${name}</li>`
        });

        const items = [makeComp("A"), makeComp("B")];
        html`<ul>${items as any}</ul>`.mount(el);

        const lis = el.querySelectorAll(".comp");
        expect(lis.length).toBe(2);
        expect(lis[0].textContent).toBe("A");
        expect(lis[1].textContent).toBe("B");
    });
});

// =============================================================================
// --- Nodos: valores reactivos (signal) ---
// =============================================================================

describe("Node binding: valores reactivos", () => {
    it("renderiza un string reactivo", async () => {
        const name = signal("world");
        const el = document.createElement("div");
        html`<p>${() => name.value}</p>`.mount(el);

        expect(el.querySelector("p")!.textContent).toBe("world");

        name.value = "nix";
        await nextTick();
        await new Promise(r => setTimeout(r, 0));

        expect(el.querySelector("p")!.textContent).toBe("nix");
    });

    it("actualiza texto en-place sin recrear el nodo", async () => {
        const count = signal(0);
        const el = document.createElement("div");
        html`<span>${() => count.value}</span>`.mount(el);

        const span = el.querySelector("span")!;
        const textNode = span.firstChild;

        count.value = 1;
        await nextTick();
        await new Promise(r => setTimeout(r, 0));

        // Mismo text node, no recreado
        expect(span.firstChild).toBe(textNode);
        expect(span.textContent).toBe("1");
    });

    it("alterna entre null y template", async () => {
        const show = signal(false);
        const el = document.createElement("div");
        html`<div>${() => show.value ? html`<span class="cond">Y</span>` : null}</div>`.mount(el);

        expect(el.querySelector(".cond")).toBeNull();

        show.value = true;
        await nextTick();

        expect(el.querySelector(".cond")).not.toBeNull();

        show.value = false;
        await nextTick();

        expect(el.querySelector(".cond")).toBeNull();
    });

    it("alterna entre dos templates distintos", async () => {
        const mode = signal<"a" | "b">("a");
        const el = document.createElement("div");
        html`<div>${() =>
            mode.value === "a"
                ? html`<p class="view-a">A</p>`
                : html`<p class="view-b">B</p>`
            }</div>`.mount(el);

        expect(el.querySelector(".view-a")).not.toBeNull();
        expect(el.querySelector(".view-b")).toBeNull();

        mode.value = "b";
        await nextTick();

        expect(el.querySelector(".view-a")).toBeNull();
        expect(el.querySelector(".view-b")).not.toBeNull();
    });

    it("limpia el template anterior al cambiar", async () => {
        const show = signal(true);
        const onUnmount = vi.fn();
        const el = document.createElement("div");

        // Usamos un componente para detectar unmount
        const comp = {
            __isNixComponent: true as const,
            render: () => html`<div class="comp">C</div>`,
            onUnmount,
        };

        html`<div>${() => show.value ? comp : null}</div>`.mount(el);

        expect(el.querySelector(".comp")).not.toBeNull();

        show.value = false;
        await nextTick();

        expect(onUnmount).toHaveBeenCalled();
        expect(el.querySelector(".comp")).toBeNull();
    });

    it("limpia correctamente al desmontar el template padre", () => {
        const el = document.createElement("div");
        const count = signal(0);
        const handle = html`<span>${() => count.value}</span>`.mount(el);

        handle.unmount();

        expect(el.innerHTML).toBe("");
    });

    it("renderiza un array mixto reactivo (strings, templates, componentes)", async () => {
        const state = signal<unknown[]>([]);
        const el = document.createElement("div");

        const comp = {
            __isNixComponent: true as const,
            render: () => html`<span class="comp">Comp</span>`
        };

        html`<div>${() => state.value}</div>`.mount(el);

        // Asignamos un array mixto dinámicamente
        state.value = ["text", html`<b>bold</b>`, comp, false, null];
        await nextTick();

        expect(el.textContent).toContain("text");
        expect(el.querySelector("b")).not.toBeNull();
        expect(el.querySelector(".comp")).not.toBeNull();
    });

    it("limpia correctamente los textNodes reactivos si el valor cambia a null", async () => {
        const state = signal<string | null>("hola");
        const el = document.createElement("div");

        html`<div>${() => state.value}</div>`.mount(el);

        expect(el.textContent).toBe("hola");

        // Cambiamos a null, esto debe eliminar el TextNode
        state.value = null;
        await nextTick();
        await new Promise(r => setTimeout(r, 0)); // wait for DOM queue

        expect(el.textContent).toBe("");

        // Volvemos a un string para ver si lo recrea correctamente
        state.value = "mundo";
        await nextTick();
        await new Promise(r => setTimeout(r, 0));

        expect(el.textContent).toBe("mundo");
    });

    it("maneja correctamente el unmount total con estados keyed activos", async () => {
        const items = signal([1, 2]);
        const el = document.createElement("div");

        // Montamos un bloque keyed reactivo
        const handle = html`<ul>${() => repeat(
            items.value,
            (n) => n,
            (n) => html`<li>${n}</li>`
        )}</ul>`.mount(el);

        expect(el.querySelectorAll("li").length).toBe(2);

        // Desmontar el root debe limpiar todo el estado de `keyedState` y anclas
        handle.unmount();

        expect(el.innerHTML).toBe("");
    });
});

// =============================================================================
// --- Keyed list (repeat) ---
// =============================================================================

describe("Node binding: repeat() keyed list", () => {
    it("renderiza una lista inicial", async () => {
        const items = signal([1, 2, 3]);
        const el = document.createElement("div");

        html`<ul>${() => repeat(
            items.value,
            (n) => n,
            (n) => html`<li class="item">${n}</li>`
        )}</ul>`.mount(el);

        expect(el.querySelectorAll(".item").length).toBe(3);
    });

    it("agrega ítems nuevos", async () => {
        const items = signal([1, 2]);
        const el = document.createElement("div");

        html`<ul>${() => repeat(
            items.value,
            (n) => n,
            (n) => html`<li class="item">${n}</li>`
        )}</ul>`.mount(el);

        items.value = [1, 2, 3];
        await nextTick();

        expect(el.querySelectorAll(".item").length).toBe(3);
    });

    it("elimina ítems quitados", async () => {
        const items = signal([1, 2, 3]);
        const el = document.createElement("div");

        html`<ul>${() => repeat(
            items.value,
            (n) => n,
            (n) => html`<li class="item">${n}</li>`
        )}</ul>`.mount(el);

        items.value = [1, 3];
        await nextTick();

        expect(el.querySelectorAll(".item").length).toBe(2);
    });

    it("reordena ítems existentes (LIS)", async () => {
        const items = signal([1, 2, 3]);
        const el = document.createElement("div");

        html`<ul>${() => repeat(
            items.value,
            (n) => n,
            (n) => html`<li data-n="${n}">${n}</li>`
        )}</ul>`.mount(el);

        items.value = [3, 1, 2];
        await nextTick();

        const lis = el.querySelectorAll("li");
        expect(lis[0].getAttribute("data-n")).toBe("3");
        expect(lis[1].getAttribute("data-n")).toBe("1");
        expect(lis[2].getAttribute("data-n")).toBe("2");
    });

    it("reemplaza lista completa (ninguna key sobrevive)", async () => {
        const items = signal([1, 2, 3]);
        const el = document.createElement("div");

        html`<ul>${() => repeat(
            items.value,
            (n) => n,
            (n) => html`<li class="item" data-n="${n}">${n}</li>`
        )}</ul>`.mount(el);

        items.value = [4, 5, 6];
        await nextTick();

        const lis = el.querySelectorAll(".item");
        expect(lis.length).toBe(3);
        expect(lis[0].getAttribute("data-n")).toBe("4");
    });

    it("lista vacía no renderiza ítems", async () => {
        const items = signal<number[]>([]);
        const el = document.createElement("div");

        html`<ul>${() => repeat(
            items.value,
            (n) => n,
            (n) => html`<li class="item">${n}</li>`
        )}</ul>`.mount(el);

        expect(el.querySelectorAll(".item").length).toBe(0);
    });

    it("llama cleanup de ítems eliminados", async () => {
        const onUnmount = vi.fn();
        const items = signal([1, 2]);
        const el = document.createElement("div");

        const makeComp = (n: number) => ({
            __isNixComponent: true as const,
            render: () => html`<li>${n}</li>`,
            onUnmount,
        });

        html`<ul>${() => repeat(
            items.value,
            (n) => n,
            (n) => makeComp(n) as any
        )}</ul>`.mount(el);

        items.value = [1]; // elimina item 2
        await nextTick();

        expect(onUnmount).toHaveBeenCalledOnce();
    });
});
