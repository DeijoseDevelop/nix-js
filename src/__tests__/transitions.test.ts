import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { transition } from "../nix/template/transitions";
import { html } from "../nix/template";
import { nextTick, signal } from "../nix/reactivity";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("transition()", () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    // =========================================================================
    // --- Render básico
    // =========================================================================

    it("monta contenido estático correctamente", () => {
        const tpl = transition(html`<div class="box">A</div>`);
        tpl.mount(container);

        expect(container.querySelector(".box")).not.toBeNull();
    });

    it("inserta marker de transición (comment node)", () => {
        const tpl = transition(html`<div>A</div>`);
        tpl.mount(container);

        const hasComment = Array.from(container.childNodes).some(
            (n) => n.nodeType === Node.COMMENT_NODE
        );

        expect(hasComment).toBe(true);
    });

    it("retorna NixTemplate válido con mount y _render", () => {
        const tpl = transition(html`<div>X</div>`);
        expect(tpl.__isNixTemplate).toBe(true);
        expect(typeof tpl.mount).toBe("function");
        expect(typeof tpl._render).toBe("function");
    });

    // =========================================================================
    // --- Enter
    // =========================================================================

    it("aplica clases de enter cuando appear=true", async () => {
        const tpl = transition(html`<div class="box"></div>`, {
            appear: true,
            duration: 10
        });

        tpl.mount(container);

        const el = container.querySelector(".box") as HTMLElement;

        expect(el).not.toBeNull();
        expect(el.className).toMatch(/enter/);

        await wait(30);

        expect(el.className).not.toMatch(/enter/);
    });

    it("aplica clase enterFrom y enterActive en orden correcto", async () => {
        const tpl = transition(html`<div class="box"></div>`, {
            name: "fade",
            appear: true,
            duration: 10
        });

        tpl.mount(container);
        const el = container.querySelector(".box") as HTMLElement;

        expect(el.classList.contains("fade-enter-from")).toBe(true);
        expect(el.classList.contains("fade-enter-active")).toBe(true);

        await wait(30);

        expect(el.classList.contains("fade-enter-active")).toBe(false);
        expect(el.classList.contains("fade-enter-to")).toBe(false);
    });

    it("NO aplica enter en primer render si appear=false", async () => {
        const tpl = transition(html`<div class="box"></div>`, {
            appear: false
        });

        tpl.mount(container);

        const el = container.querySelector(".box") as HTMLElement;

        expect(el.className).not.toMatch(/enter/);
    });

    it("usa nombre de prefijo personalizado para clases", async () => {
        const tpl = transition(html`<div class="box"></div>`, {
            name: "slide",
            appear: true,
            duration: 10
        });

        tpl.mount(container);
        const el = container.querySelector(".box") as HTMLElement;

        expect(el.classList.contains("slide-enter-from")).toBe(true);
        expect(el.classList.contains("slide-enter-active")).toBe(true);
    });

    it("respeta clases override individuales (enterFrom, enterTo, etc)", async () => {
        const tpl = transition(html`<div class="box"></div>`, {
            enterFrom: "custom-from",
            enterActive: "custom-active",
            enterTo: "custom-to",
            appear: true,
            duration: 10
        });

        tpl.mount(container);
        const el = container.querySelector(".box") as HTMLElement;

        expect(el.classList.contains("custom-from")).toBe(true);
        expect(el.classList.contains("custom-active")).toBe(true);
    });

    // =========================================================================
    // --- Leave
    // =========================================================================

    it("ejecuta leave al desmontar contenido reactivo", async () => {
        const visible = signal(true);

        const tpl = transition(() =>
            visible.value ? html`<div class="box"></div>` : null,
            { duration: 10 }
        );

        tpl.mount(container);

        expect(container.querySelector(".box")).not.toBeNull();

        visible.value = false;

        await nextTick();
        await wait(30);

        expect(container.querySelector(".box")).toBeNull();
    });

    it("aplica clases leaveFrom y leaveActive durante la salida", async () => {
        const visible = signal(true);

        const tpl = transition(() =>
            visible.value ? html`<div class="box"></div>` : null,
            { name: "fade", duration: 50 }
        );

        tpl.mount(container);

        const el = container.querySelector(".box") as HTMLElement;

        visible.value = false;
        await nextTick();

        // Inmediatamente después de iniciar leave, las clases deben estar presentes
        expect(el.classList.contains("fade-leave-from")).toBe(true);
        expect(el.classList.contains("fade-leave-active")).toBe(true);
    });

    // =========================================================================
    // --- Toggle reactivo
    // =========================================================================

    it("maneja toggle enter -> leave correctamente", async () => {
        const visible = signal(false);

        const tpl = transition(() =>
            visible.value ? html`<div class="box"></div>` : null,
            { duration: 10 }
        );

        tpl.mount(container);

        visible.value = true;
        await nextTick();

        expect(container.querySelector(".box")).not.toBeNull();

        visible.value = false;
        await nextTick();
        await wait(30);

        expect(container.querySelector(".box")).toBeNull();
    });

    it("reemplaza contenido sin animación cuando cambia (skip enter)", async () => {
        const state = signal(1);

        const tpl = transition(() => {
            return html`<div class=${`box-${state.value}`}></div>`;
        }, { duration: 10 });

        tpl.mount(container);

        expect(container.querySelector(".box-1")).not.toBeNull();

        state.value = 2;

        expect(container.querySelector(".box-1")).toBeNull();
        expect(container.querySelector(".box-2")).not.toBeNull();
    });

    it("swap non-null→non-null no aplica animación de enter", async () => {
        const state = signal("a");
        const enterSpy = vi.fn();

        const tpl = transition(() =>
            state.value === "a"
                ? html`<div class="box-a"></div>`
                : html`<div class="box-b"></div>`,
            {
                duration: 10,
                onBeforeEnter: enterSpy
            }
        );

        tpl.mount(container);
        await nextTick();

        // Swap: no debe llamar onBeforeEnter (skipAnim=true)
        state.value = "b";
        await nextTick();
        await wait(20);

        expect(enterSpy).not.toHaveBeenCalled();
    });

    // =========================================================================
    // --- Cancelación
    // =========================================================================

    it("cancela transición leave si entra nuevo contenido", async () => {
        const visible = signal(true);

        const tpl = transition(() =>
            visible.value ? html`<div class="box"></div>` : null,
            { duration: 50 }
        );

        tpl.mount(container);

        visible.value = false;
        await nextTick();

        // Antes de que termine el leave, volvemos a mostrar
        visible.value = true;
        await nextTick();

        expect(container.querySelector(".box")).not.toBeNull();
    });

    it("incrementa leaveGen en cada enter cancelando promises previas", async () => {
        const visible = signal(false);
        const leaveSpy = vi.fn();

        const tpl = transition(() =>
            visible.value ? html`<div class="box"></div>` : null,
            {
                duration: 50,
                onAfterLeave: leaveSpy
            }
        );

        tpl.mount(container);

        // toggle rápido
        visible.value = true;
        await nextTick();
        visible.value = false;
        await nextTick();
        visible.value = true; // cancela el leave
        await nextTick();

        await wait(80);

        // onAfterLeave no debe haberse llamado porque el leave fue cancelado
        expect(leaveSpy).not.toHaveBeenCalled();
    });

    // =========================================================================
    // --- Callbacks de ciclo de vida
    // =========================================================================

    it("ejecuta callbacks de ciclo de vida", async () => {
        const onBeforeEnter = vi.fn();
        const onAfterEnter = vi.fn();
        const onBeforeLeave = vi.fn();
        const onAfterLeave = vi.fn();

        const visible = signal(true);

        const tpl = transition(() =>
            visible.value ? html`<div class="box"></div>` : null,
            {
                appear: true,
                duration: 10,
                onBeforeEnter,
                onAfterEnter,
                onBeforeLeave,
                onAfterLeave
            }
        );

        tpl.mount(container);

        await nextTick();
        await wait(30);

        expect(onBeforeEnter).toHaveBeenCalled();
        expect(onAfterEnter).toHaveBeenCalled();

        visible.value = false;

        await nextTick();
        await wait(30);

        expect(onBeforeLeave).toHaveBeenCalled();
        expect(onAfterLeave).toHaveBeenCalled();
    });

    it("onBeforeEnter recibe el elemento correcto", async () => {
        let capturedEl: Element | null = null;

        const tpl = transition(html`<div class="box"></div>`, {
            appear: true,
            duration: 10,
            onBeforeEnter: (el) => { capturedEl = el; }
        });

        tpl.mount(container);
        await nextTick();

        expect(capturedEl).not.toBeNull();
        expect((capturedEl as unknown as Element).classList.contains("box")).toBe(true);
    });

    // =========================================================================
    // --- Cleanup
    // =========================================================================

    it("limpia correctamente al hacer unmount", () => {
        const tpl = transition(html`<div class="box"></div>`);
        const handle = tpl.mount(container);

        expect(container.querySelector(".box")).not.toBeNull();

        handle.unmount();

        expect(container.querySelector(".box")).toBeNull();

        const hasComment = Array.from(container.childNodes).some(
            (n) => n.nodeType === Node.COMMENT_NODE
        );

        expect(hasComment).toBe(false);
    });

    it("unmount cancela watchers reactivos", async () => {
        const visible = signal(false);
        const spy = vi.fn();

        const tpl = transition(() => {
            spy();
            return visible.value ? html`<div class="box"></div>` : null;
        }, { duration: 10 });

        const handle = tpl.mount(container);
        const callsBefore = spy.mock.calls.length;

        handle.unmount();

        visible.value = true;
        await nextTick();

        // No debe haber más llamadas después del unmount
        expect(spy.mock.calls.length).toBe(callsBefore);
    });

    it("limpia leaveCleanup pendiente al hacer unmount", async () => {
        const visible = signal(true);

        const tpl = transition(() =>
            visible.value ? html`<div class="box"></div>` : null,
            { duration: 200 }
        );

        const handle = tpl.mount(container);

        visible.value = false;
        await nextTick();
        // El leave está en curso, hacemos unmount sin esperar
        handle.unmount();

        expect(container.querySelector(".box")).toBeNull();
    });

    // =========================================================================
    // --- Duration fallback
    // =========================================================================

    it("usa duration fallback cuando no hay CSS transition", async () => {
        const tpl = transition(html`<div class="box"></div>`, {
            appear: true,
            duration: 10
        });

        tpl.mount(container);

        const el = container.querySelector(".box") as HTMLElement;

        expect(el.className).toMatch(/enter/);

        await wait(30);

        expect(el.className).not.toMatch(/enter/);
    });

    it("no mantiene dos elementos visibles durante transiciones concurrentes", async () => {
        const state = signal<1 | 2 | 3>(1);

        const tpl = transition(() => {
            if (state.value === 1) return html`<div class="box box-1">1</div>`;
            if (state.value === 2) return html`<div class="box box-2">2</div>`;
            return html`<div class="box box-3">3</div>`;
        }, { duration: 30 });

        tpl.mount(container);
        await nextTick();

        state.value = 2;
        await nextTick();
        expect(container.querySelectorAll(".box").length).toBeLessThanOrEqual(1);
        expect(container.querySelector(".box-2")).not.toBeNull();

        state.value = 3;
        await nextTick();
        expect(container.querySelectorAll(".box").length).toBeLessThanOrEqual(1);
        expect(container.querySelector(".box-3")).not.toBeNull();

        await wait(50);
        expect(container.querySelectorAll(".box").length).toBe(1);
    });

    // =========================================================================
    // --- NixComponent como contenido
    // =========================================================================

    it("soporta NixComponent como contenido estático", () => {
        const comp = {
            __isNixComponent: true as const,
            render: () => html`<div class="comp-box">Comp</div>`,
        };

        const tpl = transition(comp as any);
        tpl.mount(container);

        expect(container.querySelector(".comp-box")).not.toBeNull();
    });

    // =========================================================================
    // --- _render API interna
    // =========================================================================

    it("_render inserta content antes del nodo `before`", () => {
        const parent = document.createElement("div");
        const before = document.createTextNode("END");
        parent.appendChild(before);

        const tpl = transition(html`<span class="inner">X</span>`);
        tpl._render(parent, before);

        const span = parent.querySelector(".inner");
        expect(span).not.toBeNull();
        // Verificamos el orden en el DOM en lugar de buscar un nextSibling estricto.
        // Esto evita que falle si la función `html` inyecta markers invisibles de cierre.
        const children = Array.from(parent.childNodes);
        expect(children.indexOf(span!)).toBeLessThan(children.indexOf(before));
    });
});