import { describe, it, expect, vi } from "vitest";
import { detectContext } from "../nix/template/bindings";
import { signal, nextTick } from "../nix/reactivity";
import { html } from "../nix/template";

// =============================================================================
// --- detectContext ---
// =============================================================================

describe("detectContext()", () => {
    it("retorna type=node fuera de un tag", () => {
        const ctx = detectContext("<div>");
        expect(ctx.type).toBe("node");
    });

    it("retorna type=node con > después del último <", () => {
        const ctx = detectContext("<div class='x'>");
        expect(ctx.type).toBe("node");
    });

    it("detecta un atributo dinámico sin comillas", () => {
        const ctx = detectContext("<div id=");
        expect(ctx.type).toBe("attr");
        if (ctx.type === "attr") {
            expect(ctx.attrName).toBe("id");
            expect(ctx.hadOpenQuote).toBe(false);
        }
    });

    it("detecta un atributo dinámico con comilla de apertura", () => {
        const ctx = detectContext('<div class="');
        expect(ctx.type).toBe("attr");
        if (ctx.type === "attr") {
            expect(ctx.attrName).toBe("class");
            expect(ctx.hadOpenQuote).toBe(true);
        }
    });

    it("detecta un evento simple sin modificadores", () => {
        const ctx = detectContext("<button @click=");
        expect(ctx.type).toBe("event");
        if (ctx.type === "event") {
            expect(ctx.eventName).toBe("click");
            expect(ctx.modifiers).toEqual([]);
        }
    });

    it("detecta un evento con múltiples modificadores", () => {
        const ctx = detectContext("<button @keydown.enter.prevent=");
        expect(ctx.type).toBe("event");
        if (ctx.type === "event") {
            expect(ctx.eventName).toBe("keydown");
            expect(ctx.modifiers).toEqual(["enter", "prevent"]);
        }
    });

    it("detecta evento con comilla de apertura", () => {
        const ctx = detectContext('<button @click="');
        expect(ctx.type).toBe("event");
        if (ctx.type === "event") {
            expect(ctx.hadOpenQuote).toBe(true);
        }
    });

    it("fallback a node si no hay = en el tag incompleto", () => {
        const ctx = detectContext("<div ");
        expect(ctx.type).toBe("node");
    });

    it("detecta correctamente después de múltiples tags cerrados", () => {
        const ctx = detectContext("<div><span><p>");
        expect(ctx.type).toBe("node");
    });

    it("detecta attr en tag con otros atributos previos", () => {
        const ctx = detectContext('<input type="text" value=');
        expect(ctx.type).toBe("attr");
        if (ctx.type === "attr") {
            expect(ctx.attrName).toBe("value");
        }
    });
});

// =============================================================================
// --- Bindings de eventos ---
// =============================================================================

describe("Bindings: eventos", () => {
    it("registra un handler de click delegado", async () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);

        const tpl = html`<button @click=${handler}>Click</button>`;
        tpl.mount(el);

        (el.querySelector("button") as HTMLElement).click();

        expect(handler).toHaveBeenCalledOnce();
        document.body.removeChild(el);
    });

    it("aplica modificador prevent correctamente", async () => {
        let defaultPrevented = false;
        const handler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);

        const tpl = html`<form @submit.prevent=${handler}><button type="submit">Go</button></form>`;
        tpl.mount(el);

        const form = el.querySelector("form")!;
        const event = new Event("submit", { bubbles: true, cancelable: true });
        Object.defineProperty(event, "defaultPrevented", {
            get: () => defaultPrevented
        });
        // override preventDefault
        event.preventDefault = () => { defaultPrevented = true; };
        form.dispatchEvent(event);

        expect(handler).toHaveBeenCalled();
        document.body.removeChild(el);
    });

    it("aplica modificador stop correctamente", () => {
        const innerHandler = vi.fn();
        const outerHandler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);

        // stop en el inner previene que outer reciba el evento
        const tpl = html`<div @click=${outerHandler}><button @click.stop=${innerHandler}>X</button></div>`;
        tpl.mount(el);

        (el.querySelector("button") as HTMLElement).click();

        expect(innerHandler).toHaveBeenCalledOnce();
        // outerHandler NO debe ser llamado porque stop detiene la propagación
        expect(outerHandler).not.toHaveBeenCalled();
        document.body.removeChild(el);
    });

    it("aplica modificador self — ignora eventos de hijos", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);

        const tpl = html`<div @click.self=${handler}><span>inner</span></div>`;
        tpl.mount(el);

        // Click en el span (hijo) no debe disparar el handler
        (el.querySelector("span") as HTMLElement).click();
        expect(handler).not.toHaveBeenCalled();

        // Click directo en el div sí debe disparar
        (el.querySelector("div") as HTMLElement).dispatchEvent(
            new MouseEvent("click", { bubbles: true })
        );

        document.body.removeChild(el);
    });

    it("filtra por modificador de teclado (enter)", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);

        const tpl = html`<input @keydown.enter=${handler} />`;
        tpl.mount(el);

        const input = el.querySelector("input")!;

        // Presionar Escape no debe llamar el handler
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
        expect(handler).not.toHaveBeenCalled();

        // Presionar Enter sí debe llamar el handler
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
        expect(handler).toHaveBeenCalledOnce();

        document.body.removeChild(el);
    });

    it("limpia el handler delegado al desmontar", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);

        const tpl = html`<button @click=${handler}>X</button>`;
        const handle = tpl.mount(el);

        handle.unmount();

        // Después del unmount, el click no debe llegar al handler
        const btn = document.createElement("button");
        el.appendChild(btn);
        btn.click();

        expect(handler).not.toHaveBeenCalled();
        document.body.removeChild(el);
    });

    it("filtra por modificador de teclado de una sola letra (ej. 'a')", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);

        const tpl = html`<input @keydown.a=${handler} />`;
        tpl.mount(el);

        const input = el.querySelector("input")!;

        // Presionar 'b' no debe hacer nada
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "b", bubbles: true }));
        expect(handler).not.toHaveBeenCalled();

        // Presionar 'a' sí debe disparar el handler
        input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
        expect(handler).toHaveBeenCalledOnce();

        document.body.removeChild(el);
    });

    it("usa event listener normal (no delegado) para modificador .once", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        const tpl = html`<button @click.once=${handler}>X</button>`;
        tpl.mount(el);

        const btn = el.querySelector("button")!;
        btn.click();
        btn.click(); // El segundo click debería ser ignorado por .once

        expect(handler).toHaveBeenCalledOnce();
    });

    it("aplica prevent, stop y self en eventos no delegados", () => {
        const handler = vi.fn();
        let defaultPrevented = false;
        let propagationStopped = false;

        const el = document.createElement("div");
        const tpl = html`<div class="outer" @click.capture.prevent.stop.self=${handler}><span class="inner">X</span></div>`;
        tpl.mount(el);

        const outer = el.querySelector(".outer") as HTMLElement;
        const inner = el.querySelector(".inner") as HTMLElement;

        // 1. Prueba .self (click en hijo no debe disparar)
        const eventHijo = new MouseEvent("click", { bubbles: true, cancelable: true });
        inner.dispatchEvent(eventHijo);
        expect(handler).not.toHaveBeenCalled();

        // 2. Prueba click directo
        const eventDirecto = new MouseEvent("click", { bubbles: true, cancelable: true });
        eventDirecto.preventDefault = () => { defaultPrevented = true; };
        eventDirecto.stopPropagation = () => { propagationStopped = true; };

        outer.dispatchEvent(eventDirecto);

        expect(handler).toHaveBeenCalledOnce();
        expect(defaultPrevented).toBe(true);
        expect(propagationStopped).toBe(true);
    });

    it("limpia event listeners no delegados al desmontar", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        // 'scroll' no está en el Set DELEGABLE_EVENTS
        const tpl = html`<div @scroll=${handler}>X</div>`;
        const handle = tpl.mount(el);

        const div = el.querySelector("div")!;
        div.dispatchEvent(new Event("scroll"));
        expect(handler).toHaveBeenCalledOnce();

        handle.unmount(); // Esto debe hacer removeEventListener

        div.dispatchEvent(new Event("scroll"));
        // No debe incrementar
        expect(handler).toHaveBeenCalledOnce();
    });
});

// =============================================================================
// --- Bindings de atributos ---
// =============================================================================

describe("Bindings: atributos", () => {
    it("establece un atributo estático", () => {
        const el = document.createElement("div");
        const tpl = html`<input type=${"email"} />`;
        tpl.mount(el);
        expect(el.querySelector("input")!.getAttribute("type")).toBe("email");
    });

    it("establece un atributo reactivo", async () => {
        const cls = signal("foo");
        const el = document.createElement("div");
        const tpl = html`<div class=${() => cls.value}></div>`;
        tpl.mount(el);

        expect(el.querySelector("div")!.getAttribute("class")).toBe("foo");

        cls.value = "bar";
        await nextTick();
        // esperar el queueDOMWrite
        await new Promise(r => setTimeout(r, 0));

        expect(el.querySelector("div")!.getAttribute("class")).toBe("bar");
    });

    it("elimina el atributo cuando el valor es null/undefined/false", () => {
        const el = document.createElement("div");
        const tpl = html`<div hidden=${false}></div>`;
        tpl.mount(el);
        expect(el.querySelector("div")!.hasAttribute("hidden")).toBe(false);
    });

    it("usa DOM property para value en inputs", () => {
        const el = document.createElement("div");
        const tpl = html`<input value=${"test"} />`;
        tpl.mount(el);
        expect((el.querySelector("input") as HTMLInputElement).value).toBe("test");
    });

    it("usa DOM property para checked en checkboxes", () => {
        const el = document.createElement("div");
        const tpl = html`<input type="checkbox" checked=${true} />`;
        tpl.mount(el);
        expect((el.querySelector("input") as HTMLInputElement).checked).toBe(true);
    });

    it("asigna ref correctamente", () => {
        const el = document.createElement("div");
        const myRef = { el: null as Element | null };
        const tpl = html`<span ref=${myRef}>X</span>`;
        const handle = tpl.mount(el);

        expect(myRef.el).not.toBeNull();
        expect(myRef.el!.tagName).toBe("SPAN");

        handle.unmount();
        expect(myRef.el).toBeNull();
    });

    it("elimina el atributo reactivo si el valor pasa a null o false", async () => {
        const val = signal<string | null | boolean>("active");
        const el = document.createElement("div");
        const tpl = html`<div data-state=${() => val.value}></div>`;
        tpl.mount(el);

        const div = el.querySelector("div")!;
        expect(div.getAttribute("data-state")).toBe("active");

        // Cambiar a null debe eliminar el atributo completamente del DOM
        val.value = null;
        await nextTick();
        await new Promise(r => setTimeout(r, 0)); // Esperar queueDOMWrite
        expect(div.hasAttribute("data-state")).toBe(false);

        // Volver a poner un string debe restaurarlo
        val.value = "visible";
        await nextTick();
        await new Promise(r => setTimeout(r, 0));
        expect(div.getAttribute("data-state")).toBe("visible");

        // Cambiar a false también debe eliminarlo (útil para atributos booleanos como disabled)
        val.value = false;
        await nextTick();
        await new Promise(r => setTimeout(r, 0));
        expect(div.hasAttribute("data-state")).toBe(false);
    });

    it("asigna string vacío si una DOM property reactiva pasa a null o undefined", async () => {
        const val = signal<string | null>("test");
        const el = document.createElement("div");
        const tpl = html`<input value=${() => val.value} />`;
        tpl.mount(el);

        const input = el.querySelector("input")!;
        expect(input.value).toBe("test");

        val.value = null;
        await nextTick();
        await new Promise(r => setTimeout(r, 0));
        expect(input.value).toBe(""); // En inputs null se vuelve string vacío
    });

    it("usa DOM property nativa para selected en options", () => {
        const el = document.createElement("div");
        const tpl = html`<select><option selected=${true}>A</option></select>`;
        tpl.mount(el);
        expect((el.querySelector("option") as HTMLOptionElement).selected).toBe(true);
    });
});

// =============================================================================
// --- show / hide ---
// =============================================================================

describe("Bindings: show y hide", () => {
    it("show=true deja el elemento visible", () => {
        const el = document.createElement("div");
        const tpl = html`<div show=${true}>X</div>`;
        tpl.mount(el);
        expect((el.querySelector("div") as HTMLElement).style.display).not.toBe("none");
    });

    it("show=false oculta el elemento", () => {
        const el = document.createElement("div");
        const tpl = html`<div show=${false}>X</div>`;
        tpl.mount(el);
        expect((el.querySelector("div") as HTMLElement).style.display).toBe("none");
    });

    it("hide=true oculta el elemento", () => {
        const el = document.createElement("div");
        const tpl = html`<div hide=${true}>X</div>`;
        tpl.mount(el);
        expect((el.querySelector("div") as HTMLElement).style.display).toBe("none");
    });

    it("hide=false deja el elemento visible", () => {
        const el = document.createElement("div");
        const tpl = html`<div hide=${false}>X</div>`;
        tpl.mount(el);
        expect((el.querySelector("div") as HTMLElement).style.display).not.toBe("none");
    });

    it("show reactivo actualiza display al cambiar la señal", async () => {
        const visible = signal(true);
        const el = document.createElement("div");
        const tpl = html`<div show=${() => visible.value}>X</div>`;
        tpl.mount(el);

        const div = el.querySelector("div") as HTMLElement;
        expect(div.style.display).not.toBe("none");

        visible.value = false;
        await nextTick();
        await new Promise(r => setTimeout(r, 0));

        expect(div.style.display).toBe("none");
    });

    it("hide reactivo actualiza display al cambiar la señal", async () => {
        const hidden = signal(false);
        const el = document.createElement("div");
        const tpl = html`<div hide=${() => hidden.value}>X</div>`;
        tpl.mount(el);

        const div = el.querySelector("div") as HTMLElement;
        expect(div.style.display).not.toBe("none");

        hidden.value = true;
        await nextTick();
        await new Promise(r => setTimeout(r, 0));

        expect(div.style.display).toBe("none");
    });
});
