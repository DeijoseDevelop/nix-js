import { describe, it, expect, vi } from "vitest";
import { signal } from "../nix/reactivity";
import { html, ref, showWhen, repeat } from "../nix/template";

// ── html`` tag ────────────────────────────────────────────────────────────────

describe("html`…`", () => {
    it("creates a NixTemplate with __isNixTemplate marker", () => {
        const t = html`<p>hello</p>`;
        expect(t.__isNixTemplate).toBe(true);
    });

    it("mounts static content into the DOM", () => {
        const el = document.createElement("div");
        html`<p>Hello</p>`.mount(el);
        expect(el.querySelector("p")!.textContent).toBe("Hello");
    });

    it("mounts dynamic text via getter function", () => {
        const s = signal("A");
        const el = document.createElement("div");
        html`<span>${() => s.value}</span>`.mount(el);
        expect(el.querySelector("span")!.textContent).toBe("A");
        s.value = "B";
        expect(el.querySelector("span")!.textContent).toBe("B");
    });

    it("reactively updates attributes", () => {
        const cls = signal("red");
        const el = document.createElement("div");
        html`<span class=${() => cls.value}>x</span>`.mount(el);
        expect(el.querySelector("span")!.className).toBe("red");
        cls.value = "blue";
        expect(el.querySelector("span")!.className).toBe("blue");
    });

    it("handles boolean attributes", () => {
        const disabled = signal(true);
        const el = document.createElement("div");
        html`<button disabled=${() => disabled.value}>click</button>`.mount(el);
        const btn = el.querySelector("button")!;
        expect(btn.disabled).toBe(true);
        disabled.value = false;
        expect(btn.disabled).toBe(false);
    });

    it("attaches event listeners with @event syntax", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        html`<button @click=${handler}>ok</button>`.mount(el);
        el.querySelector("button")!.click();
        expect(handler).toHaveBeenCalledOnce();
    });

    it("mounts with CSS selector string", () => {
        const container = document.createElement("div");
        container.id = "mount-target";
        document.body.appendChild(container);
        html`<p>mounted</p>`.mount("#mount-target");
        expect(container.querySelector("p")!.textContent).toBe("mounted");
        document.body.removeChild(container);
    });

    it("renders null/undefined/false as empty", () => {
        const el = document.createElement("div");
        html`<div>${null}${undefined}${false}</div>`.mount(el);
        const div = el.querySelector("div")!;
        expect(div.textContent!.trim()).toBe("");
    });

    it("renders arrays", () => {
        const items = ["a", "b", "c"];
        const el = document.createElement("div");
        html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`.mount(el);
        const lis = el.querySelectorAll("li");
        expect(lis.length).toBe(3);
        expect(lis[0].textContent).toBe("a");
        expect(lis[2].textContent).toBe("c");
    });

    it("unmount removes content and cleans effects", () => {
        const s = signal(0);
        const el = document.createElement("div");
        const handle = html`<p>${() => s.value}</p>`.mount(el);
        expect(el.querySelector("p")).not.toBeNull();
        handle.unmount();
        expect(el.innerHTML).toBe("");
    });

    it("renders conditional content reactively", () => {
        const show = signal(true);
        const el = document.createElement("div");
        html`<div>${() => show.value ? html`<span>yes</span>` : html`<span>no</span>`}</div>`.mount(el);
        expect(el.querySelector("span")!.textContent).toBe("yes");
        show.value = false;
        expect(el.querySelector("span")!.textContent).toBe("no");
    });

    it("renders reactive style strings", () => {
        const color = signal("red");
        const el = document.createElement("div");
        html`<p style=${() => "color:" + color.value}>x</p>`.mount(el);
        const p = el.querySelector("p")!;
        expect(p.getAttribute("style")).toContain("red");
        color.value = "blue";
        expect(p.getAttribute("style")).toContain("blue");
    });
});

// ── ref ───────────────────────────────────────────────────────────────────────

describe("ref", () => {
    it("captures a DOM element reference", () => {
        const r = ref<HTMLParagraphElement>();
        const el = document.createElement("div");
        html`<p ref=${r}>hello</p>`.mount(el);
        expect(r.el).toBeInstanceOf(HTMLParagraphElement);
        expect(r.el!.textContent).toBe("hello");
    });

    it("starts as null before mount", () => {
        const r = ref<HTMLDivElement>();
        expect(r.el).toBeNull();
    });
});

// ── showWhen ──────────────────────────────────────────────────────────────────

describe("showWhen", () => {
    it("hides element when condition is false", () => {
        const el = document.createElement("div");
        showWhen(el, false);
        expect(el.style.display).toBe("none");
    });

    it("shows element when condition is true", () => {
        const el = document.createElement("div");
        showWhen(el, false);
        showWhen(el, true);
        expect(el.style.display).toBe("");
    });
});

// ── repeat ────────────────────────────────────────────────────────────────────

describe("repeat", () => {
    it("creates a KeyedList marker", () => {
        const list = repeat([1, 2, 3], (i) => i, (i) => html`<li>${i}</li>`);
        expect(list.__isKeyedList).toBe(true);
        expect(list.items).toEqual([1, 2, 3]);
    });

    it("renders keyed items in the DOM", () => {
        const items = signal(["a", "b", "c"]);
        const el = document.createElement("div");
        html`<ul>${() => repeat(items.value, (i) => i, (i) => html`<li>${i}</li>`)}</ul>`.mount(el);
        expect(el.querySelectorAll("li").length).toBe(3);
        expect(el.querySelectorAll("li")[1].textContent).toBe("b");
    });

    it("reactively updates when items change", () => {
        const items = signal(["x", "y"]);
        const el = document.createElement("div");
        html`<ul>${() => repeat(items.value, (i) => i, (i) => html`<li>${i}</li>`)}</ul>`.mount(el);
        expect(el.querySelectorAll("li").length).toBe(2);
        items.value = ["x", "y", "z"];
        expect(el.querySelectorAll("li").length).toBe(3);
        expect(el.querySelectorAll("li")[2].textContent).toBe("z");
    });
});
