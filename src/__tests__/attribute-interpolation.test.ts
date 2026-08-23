import { describe, it, expect, vi } from "vitest";
import { html, analyzeTemplate, buildCanonicalValues, templateFeatures, NIX_TEMPLATE_DESCRIPTOR, type TemplateDescriptor } from "../nix/template";
import { signal, batch, nextTick } from "../nix/reactivity";
import { renderToString, renderToChunks } from "../nix/server";
import { hydrate } from "../nix/hydrate";

function descriptorOf(tpl: ReturnType<typeof html>): TemplateDescriptor {
    return (tpl as unknown as Record<PropertyKey, unknown>)[NIX_TEMPLATE_DESCRIPTOR] as TemplateDescriptor;
}

function mountHTML(tpl: ReturnType<typeof html>): string {
    const el = document.createElement("div");
    tpl.mount(el);
    return el.innerHTML;
}

/**
 * Convierte una plantilla con interpolaciones `${"..."}` en strings/values,
 * igual que lo haría el tagged template. Útil para la matriz sintáctica.
 */
function splitTemplate(template: string): { strings: string[]; values: unknown[] } {
    const strings: string[] = [];
    const values: unknown[] = [];
    const re = /\$\{"((?:[^"\\]|\\.)*)"\}/;
    let rest = template;
    while (re.test(rest)) {
        const m = re.exec(rest)!;
        strings.push(rest.slice(0, m.index));
        values.push(m[1]);
        rest = rest.slice(m.index + m[0].length);
    }
    strings.push(rest);
    return { strings, values };
}

function mountTemplateText(template: string): string {
    const { strings, values } = splitTemplate(template);
    return mountHTML(html(strings as unknown as TemplateStringsArray, ...values));
}

// =============================================================================
// --- Fase 2/3: Lexer y plan ---
// =============================================================================

describe("analyzeTemplate(): plan", () => {
    it("fast path: sin parciales devuelve las strings originales", () => {
        const strs = ["<div class=\"", "\">x</div>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(false);
        expect(plan.normalizedStrings).toBe(strs);
        expect(plan.valuePlans).toEqual([{ type: "passthrough" }]);
    });

    it("agrupa huecos consecutivos de un mismo valor quoted", () => {
        const strs = ["<div class=\"btn ", " size-", " end\">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<div class=\"", "\">"]);
        const g = plan.valuePlans[0];
        expect(g.type).toBe("composite-attribute");
        if (g.type === "composite-attribute") {
            expect(g.attrName).toBe("class");
            expect(g.firstHole).toBe(0);
            expect(g.lastHole).toBe(1);
            expect(g.quote).toBe('"');
            expect(g.literals).toEqual(["btn ", " size-", " end"]);
            expect(g.sourceIndices).toEqual([0, 1]);
        }
    });

    it("agrupa huecos adyacentes sin estático: id=${a}${b}", () => {
        const strs = ["<div id=", "", ">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<div id=", ">"]);
        const g = plan.valuePlans[0];
        expect(g.type).toBe("composite-attribute");
        if (g.type === "composite-attribute") {
            expect(g.literals).toEqual(["", "", ""]);
            expect(g.sourceIndices).toEqual([0, 1]);
        }
    });

    it("binding completo con comillas queda passthrough", () => {
        const strs = ["<div class=\"", "\">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(false);
    });

    it("binding completo sin comillas queda passthrough", () => {
        const strs = ["<div id=", ">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(false);
    });

    it("evento completo queda passthrough", () => {
        const strs = ["<button @click=", ">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(false);
        expect(plan.valuePlans[0]).toEqual({ type: "passthrough" });
    });

    it("unquoted con sufijo estático es parcial", () => {
        const strs = ["<div id=foo-", "bar>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<div id=", ">"]);
    });

    it("dos regiones separadas generan dos grupos", () => {
        const strs = ["<div class=\"a", "\" id=\"b", "\">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<div class=\"", "\" id=\"", "\">"]);
        const g0 = plan.valuePlans[0];
        const g1 = plan.valuePlans[1];
        expect(g0).not.toBe(g1);
        if (g0.type === "composite-attribute") {
            expect(g0.attrName).toBe("class");
            expect(g0.firstHole).toBe(0);
        }
        if (g1.type === "composite-attribute") {
            expect(g1.attrName).toBe("id");
            expect(g1.firstHole).toBe(1);
        }
    });

    it("no confunde texto fuera de tags", () => {
        const strs = ["<p>a < b = c ", "</p>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(false);
    });

    it("script/style/textarea se tratan como raw text", () => {
        const strs = ["<script>if (a < b && c > d) { ", " }</script>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(false);
        expect(plan.valuePlans[0]).toEqual({ type: "passthrough" });
    });

    it("atributos dentro de script raw text no se confunden", () => {
        const strs = ["<script>const s = '<div class=\"x\">'; ", "</script>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(false);
    });

    it("textarea con contenido", () => {
        const strs = ["<textarea name=\"a\" cols=30>", "</textarea>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(false);
        expect(plan.valuePlans[0]).toEqual({ type: "passthrough" });
    });

    it("comentarios HTML no abren regiones de atributo", () => {
        const strs = ["<!-- class=\"x\" --><div class=\"btn ", "\"></div>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<!-- class=\"x\" --><div class=\"", "\"></div>"]);
    });

    it("doctype y processing instructions", () => {
        const strs = ["<!DOCTYPE html><html><body class=\"a ", "\"></body></html>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<!DOCTYPE html><html><body class=\"", "\"></body></html>"]);
    });

    it("valor con la otra comilla dentro", () => {
        const strs = ["<div title=\"it's ", "\">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<div title=\"", "\">"]);
    });

    it("valor unquoted con / no se rompe", () => {
        const strs = ["<a href=/foo/", "/bar>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<a href=", ">"]);
    });

    it("self-closing tag: / seguido de >", () => {
        const strs = ["<img src=\"a", "\" />"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<img src=\"", "\" />"]);
    });

    it("void tag con parcial", () => {
        const strs = ["<br class=\"x", "\">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.normalizedStrings).toEqual(["<br class=\"", "\">"]);
    });

    it("whitespace alrededor de = en parcial quoted", () => {
        const strs = ["<div class = \"btn ", "\">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        // el head canónico normaliza `name = "` → `name="`
        expect(plan.normalizedStrings).toEqual(["<div class=\"", "\">"]);
        const g = plan.valuePlans[0];
        if (g.type === "composite-attribute") {
            expect(g.attrName).toBe("class");
        }
    });

    it("tag name cerrado: </div> no entra en raw text", () => {
        const strs = ["<div>", "</div><span class=\"a", "\"></span>"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.valuePlans[0]).toEqual({ type: "passthrough" });
        expect(plan.normalizedStrings[1]).toBe("</div><span class=\"");
    });

    it("atributos posteriores a un parcial se siguen detectando", () => {
        const strs = ["<div class=\"a ", "\" id=", ">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        expect(plan.hasPartialAttributes).toBe(true);
        expect(plan.valuePlans[1]).toEqual({ type: "passthrough" });
        expect(plan.normalizedStrings[0]).toBe("<div class=\"");
        expect(plan.normalizedStrings[1]).toBe("\" id=");
        expect(plan.normalizedStrings[2]).toBe(">");
    });
});

// =============================================================================
// --- Fase 3: Composición ---
// =============================================================================

describe("composición de valores", () => {
    it("concatena con String() por segmento: ${1}${2} → '12'", () => {
        expect(mountHTML(html`<div id=${1}${2}>x</div>`)).toBe('<div id="12">x</div>');
    });

    it("null/undefined/false parciales siguen semántica JS", () => {
        expect(mountHTML(html`<div class="a ${null} b">x</div>`)).toBe('<div class="a null b">x</div>');
        expect(mountHTML(html`<div class="a ${undefined} b">x</div>`)).toBe('<div class="a undefined b">x</div>');
        expect(mountHTML(html`<div class="a ${false} b">x</div>`)).toBe('<div class="a false b">x</div>');
    });

    it("binding completo null/false elimina el atributo (semántica actual)", () => {
        expect(mountHTML(html`<div class=${null}>x</div>`)).toBe("<div>x</div>");
        expect(mountHTML(html`<div class=${false}>x</div>`)).toBe("<div>x</div>");
        expect(mountHTML(html`<div class="${null}">x</div>`)).toBe("<div>x</div>");
    });

    it("bigint, booleans y arrays se convierten con String()", () => {
        expect(mountHTML(html`<div data-x="n ${10n} b"></div>`)).toBe('<div data-x="n 10 b"></div>');
        expect(mountHTML(html`<div data-x="n ${true} b"></div>`)).toBe('<div data-x="n true b"></div>');
        expect(mountHTML(html`<div data-x="n ${[1, 2]} b"></div>`)).toBe('<div data-x="n 1,2 b"></div>');
    });

    it("objetos usan toString", () => {
        const obj = { toString: () => "obj" };
        expect(mountHTML(html`<div data-x="n ${obj} b"></div>`)).toBe('<div data-x="n obj b"></div>');
    });

    it("Symbol se convierte con String()", () => {
        expect(mountHTML(html`<div data-x="n ${Symbol("s")} b"></div>`)).toBe('<div data-x="n Symbol(s) b"></div>');
    });

    it("excepciones de toString se propagan", () => {
        const obj = { toString: () => { throw new Error("boom"); } };
        expect(() => html`<div data-x="a ${obj} b">`).toThrow("boom");
    });

    it("mezcla valores estáticos y getters en el mismo atributo", async () => {
        const s1 = signal("big");
        const s2 = signal("x");
        const tpl = html`<div class="btn ${() => s1.value} size-${() => s2.value} end">x</div>`;
        const el = document.createElement("div");
        tpl.mount(el);
        expect(el.querySelector("div")?.className).toBe("btn big size-x end");
        s1.value = "small";
        s2.value = "y";
        await nextTick();
        expect(el.querySelector("div")?.className).toBe("btn small size-y end");
    });
});

// =============================================================================
// --- Fase 4/5: DOM mount y reactividad ---
// =============================================================================

describe("DOM mount y reactividad", () => {
    it("primera asignación síncrona", () => {
        const el = document.createElement("div");
        html`<div class="btn ${"big"}">x</div>`.mount(el);
        expect(el.querySelector("div")?.className).toBe("btn big");
    });

    it("una señal: update tras cambio", async () => {
        const s = signal("a");
        const el = document.createElement("div");
        const tpl = html`<div class="x-${() => s.value}">x</div>`;
        tpl.mount(el);
        s.value = "b";
        await nextTick();
        expect(el.querySelector("div")?.className).toBe("x-b");
    });

    it("varias señales: un solo efecto y una sola escritura por flush", async () => {
        const a = signal("a");
        const b = signal("b");
        const c = signal("c");
        const el = document.createElement("div");
        const tpl = html`<div class="${() => a.value}-${() => b.value}-${() => c.value}">x</div>`;

        const writes: string[] = [];
        const orig = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name: string, value: string) {
            writes.push(`${name}=${value}`);
            return orig.call(this, name, value);
        };
        try {
            tpl.mount(el);
            expect(writes.length).toBe(1);
            batch(() => {
                a.value = "1";
                b.value = "2";
                c.value = "3";
            });
            await nextTick(); // la escritura DOM compuesta ocurre en un microtask
            expect(writes.length).toBe(2); // una sola escritura compuesta
            expect(el.querySelector("div")?.className).toBe("1-2-3");
        } finally {
            Element.prototype.setAttribute = orig;
        }
    });

    it("varias señales en el mismo microtask: una sola escritura", async () => {
        const a = signal("a");
        const b = signal("b");
        const el = document.createElement("div");
        const tpl = html`<div class="${() => a.value}-${() => b.value}">x</div>`;
        const writes: string[] = [];
        const orig = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name: string, value: string) {
            writes.push(`${name}=${value}`);
            return orig.call(this, name, value);
        };
        try {
            tpl.mount(el);
            a.value = "1";
            b.value = "2";
            await nextTick();
            await nextTick();
            expect(writes.length).toBe(2);
        } finally {
            Element.prototype.setAttribute = orig;
        }
    });

    it("dependency switching dentro del getter compuesto", async () => {
        const cond = signal(true);
        const a = signal("a");
        const b = signal("b");
        const el = document.createElement("div");
        const tpl = html`<div class="${() => (cond.value ? a.value : b.value)}">x</div>`;
        tpl.mount(el);
        expect(el.querySelector("div")?.className).toBe("a");
        cond.value = false;
        await nextTick();
        expect(el.querySelector("div")?.className).toBe("b");
        a.value = "a2"; // ya no es dependencia
        await nextTick();
        expect(el.querySelector("div")?.className).toBe("b");
        b.value = "b2";
        await nextTick();
        expect(el.querySelector("div")?.className).toBe("b2");
    });

    it("unmount elimina el efecto compuesto y no hay updates tardíos", async () => {
        const s = signal("a");
        const el = document.createElement("div");
        const tpl = html`<div class="x-${() => s.value}">x</div>`;
        const handle = tpl.mount(el);
        const div = el.querySelector("div")!;
        expect(div.className).toBe("x-a");
        handle.unmount();
        s.value = "b";
        await nextTick();
        expect(div.className).toBe("x-a");
    });

    it("prefijo, sufijo e infijo combinados", () => {
        const el = document.createElement("div");
        html`<div data-role="btn ${"A"} mid ${"B"} end">x</div>`.mount(el);
        expect(el.querySelector("div")?.getAttribute("data-role")).toBe("btn A mid B end");
    });

    it("varios atributos parciales en un elemento", () => {
        expect(mountHTML(html`<a href="/x/${"p"}" class="btn ${"b"}" title="t ${"i"} e">x</a>`)).toBe(
            '<a href="/x/p" class="btn b" title="t i e">x</a>',
        );
    });

    it("parciales mezclados con bindings completos y eventos", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);
        const tpl = html`<button class="btn ${"b"}" id=${"i"} @click=${handler}>${"text"}</button>`;
        tpl.mount(el);
        const btn = el.querySelector("button")!;
        expect(btn.className).toBe("btn b");
        expect(btn.id).toBe("i");
        btn.click();
        expect(handler).toHaveBeenCalledOnce();
        document.body.removeChild(el);
    });

    it("valor vacío en segmento estático", () => {
        expect(mountHTML(html`<div class="${""}a">x</div>`)).toBe('<div class="a">x</div>');
        expect(mountHTML(html`<div class="a${""}">x</div>`)).toBe('<div class="a">x</div>');
    });

    it("custom elements", () => {
        expect(mountHTML(html`<my-widget class="x ${"y"}">`)).toBe('<my-widget class="x y"></my-widget>');
    });

    it("SVG y xlink:href", () => {
        const el = document.createElement("div");
        const tpl = html`<svg><use xlink:href="#icon-${"home"}"></use></svg>`;
        tpl.mount(el);
        const use = el.querySelector("use")!;
        expect(use.getAttribute("xlink:href")).toBe("#icon-home");
    });

    it("propiedad value con parcial", async () => {
        const s = signal("abc");
        const el = document.createElement("div");
        const tpl = html`<input value="prefix-${() => s.value}">`;
        tpl.mount(el);
        expect((el.querySelector("input") as HTMLInputElement).value).toBe("prefix-abc");
        s.value = "def";
        await nextTick();
        expect((el.querySelector("input") as HTMLInputElement).value).toBe("prefix-def");
    });

    it("multiple mounts comparten plan pero no estado", async () => {
        const s = signal("a");
        const tpl = html`<div class="x-${() => s.value}">x</div>`;
        const el1 = document.createElement("div");
        const el2 = document.createElement("div");
        tpl.mount(el1);
        tpl.mount(el2);
        s.value = "b";
        await nextTick();
        expect(el1.querySelector("div")?.className).toBe("x-b");
        expect(el2.querySelector("div")?.className).toBe("x-b");
    });

    it("repeat() con items con parciales reutiliza el plan", () => {
        const items = [{ id: 1, name: "a" }, { id: 2, name: "b" }];
        const tpl = html`<ul>${items.map((it) => html`<li class="item-${it.id}" data-name="${it.name}">${it.name}</li>`)}</ul>`;
        const el = document.createElement("div");
        tpl.mount(el);
        expect(el.querySelectorAll("li").length).toBe(2);
        expect(el.querySelector("li")?.className).toBe("item-1");
    });
});

// =============================================================================
// --- Fase 6: SSR, streaming e hidratación ---
// =============================================================================

describe("SSR, streaming e hidratación", () => {
    it("SSR sin markers", async () => {
        const tpl = html`<a href="/blog/${"post"}" class="btn ${"big"}">${"text"}</a>`;
        expect(await renderToString(tpl)).toBe('<a href="/blog/post" class="btn big">text</a>');
    });

    it("SSR con markers: un data-nix-a-N por atributo lógico", async () => {
        const tpl = html`<a href="/blog/${"post"}" class="btn ${"big"}">${"text"}</a>`;
        const rendered = await renderToString(tpl, { markers: "hydration" });
        expect(rendered).toContain('data-nix-a-0="href"');
        expect(rendered).toContain('data-nix-a-1="class"');
        expect(rendered).toContain('href="/blog/post"');
        expect(rendered).toContain('class="btn big"');
        expect(rendered).toContain("<!--nix-2-->");
        expect(rendered.match(/data-nix-a/g)?.length).toBe(2);
    });

    it("SSR escapa el valor compuesto una sola vez", async () => {
        const tpl = html`<div title="a ${'"<>&'} b">x</div>`;
        expect(await renderToString(tpl)).toBe('<div title="a &quot;&lt;&gt;&amp; b">x</div>');
    });

    it("SSR con getter se evalúa una vez", async () => {
        let calls = 0;
        const tpl = html`<div class="x ${() => { calls++; return "y"; }}">`;
        expect(await renderToString(tpl)).toBe('<div class="x y">');
        expect(calls).toBe(1);
    });

    it("streaming nunca emite la mitad de un atributo", async () => {
        const tpl = html`<div class="a ${"b"} c" title=${"t"}>${"body"}</div>`;
        let out = "";
        for await (const chunk of renderToChunks(tpl)) {
            out += chunk.value;
        }
        expect(out).toBe('<div class="a b c" title="t">body</div>');
    });

    it("hidratación: DOM SSR y DOM cliente convergen", async () => {
        const tpl = html`<a class="btn ${"big"}" href="/x/${"y"}">${"go"}</a>`;
        const container = document.createElement("div");
        container.innerHTML = await renderToString(tpl, { markers: "hydration" });
        const handle = hydrate(tpl, container);
        expect(container.querySelector("a")?.className).toBe("btn big");
        expect(container.querySelector("a")?.getAttribute("href")).toBe("/x/y");
        expect(container.querySelector("a")?.textContent).toBe("go");
        handle.unmount();
    });

    it("hidratación con getter reactivo: updates posteriores", async () => {
        const s = signal("big");
        const tpl = html`<a class="btn ${() => s.value}">${"go"}</a>`;
        const container = document.createElement("div");
        container.innerHTML = await renderToString(tpl, { markers: "hydration" });
        hydrate(tpl, container);
        s.value = "small";
        await nextTick();
        expect(container.querySelector("a")?.className).toBe("btn small");
    });

    it("hidratación de parcial en propiedad value preserva interacción previa", async () => {
        const s = signal("model");
        const tpl = html`<input value="prefix-${() => s.value}">`;
        const container = document.createElement("div");
        container.innerHTML = await renderToString(tpl, { markers: "hydration" });
        const input = container.querySelector("input") as HTMLInputElement;
        input.value = "user-typed";
        const handle = hydrate(tpl, container);
        // El DOM es autoritativo tras interacción previa
        expect((container.querySelector("input") as HTMLInputElement).value).toBe("user-typed");
        handle.unmount();
    });

    it("parciales dentro de componentes SSR", async () => {
        const inner = html`<span class="s-${"x"}">${"y"}</span>`;
        const outer = html`<div class="o-${"z"}">${inner}</div>`;
        expect(await renderToString(outer)).toBe('<div class="o-z"><span class="s-x">y</span></div>');
    });

    it("paridad de índices de markers entre SSR y client", async () => {
        const tpl = html`<div class="a ${"b"}" id=${"c"}>${"d"}<span data-n="x ${"y"}"></span></div>`;
        const ssr = await renderToString(tpl, { markers: "hydration" });
        const container = document.createElement("div");
        container.innerHTML = ssr;
        const handle = hydrate(tpl, container);
        expect(container.querySelector("div")?.className).toBe("a b");
        expect(container.querySelector("div")?.id).toBe("c");
        expect(container.querySelector("span")?.getAttribute("data-n")).toBe("x y");
        handle.unmount();
    });

    it("parcial en atributo dentro de nodo anidado en array", async () => {
        const item = html`<li data-k="k-${"v"}">${"n"}</li>`;
        const tpl = html`<ul>${[item, item]}</ul>`;
        const container = document.createElement("div");
        container.innerHTML = await renderToString(tpl, { markers: "hydration" });
        const handle = hydrate(tpl, container);
        expect(container.querySelectorAll("li").length).toBe(2);
        expect(container.querySelector("li")?.getAttribute("data-k")).toBe("k-v");
        handle.unmount();
    });
});

// =============================================================================
// --- Fase 7: Seguridad ---
// =============================================================================

describe("sanitización de URLs compuestas", () => {
    it("esquema peligroso íntegro en segmento dinámico (parcial con sufijo)", () => {
        const el = document.createElement("div");
        html`<a href="${"javascript:alert(1)"}x">x</a>`.mount(el);
        expect(el.querySelector("a")?.getAttribute("href")).toBe("");
    });

    it("javascript: dividido entre partes estáticas y dinámicas", () => {
        const el = document.createElement("div");
        html`<a href="java${"script:"}alert(1)">x</a>`.mount(el);
        expect(el.querySelector("a")?.getAttribute("href")).toBe("");
    });

    it("scheme con casing y control characters", () => {
        const el = document.createElement("div");
        html`<a href="${"JaVaScRiPt:"}alert(1)">x</a>`.mount(el);
        expect(el.querySelector("a")?.getAttribute("href")).toBe("");
        html`<a href="java\tscript:alert(1)">x</a>`.mount(el);
        expect(el.querySelector("a")?.getAttribute("href")).toBe("");
    });

    it("src parcial con esquema seguro pasa intacto", () => {
        const el = document.createElement("div");
        html`<img src="/img/${"cat"}.png">`.mount(el);
        expect(el.querySelector("img")?.getAttribute("src")).toBe("/img/cat.png");
    });

    it("URL segura con partes mixtas estáticas/reactivas", async () => {
        const tpl = html`<a href="https://x.dev/${"a"}/b?q=${"c"}">x</a>`;
        const el = document.createElement("div");
        tpl.mount(el);
        expect(el.querySelector("a")?.getAttribute("href")).toBe("https://x.dev/a/b?q=c");
        expect(await renderToString(tpl)).toBe('<a href="https://x.dev/a/b?q=c">x</a>');
    });

    it("data:text/html bloqueado incluso con segmentos mixtos", () => {
        const el = document.createElement("div");
        html`<a href="data:${"text/html"},">x</a>`.mount(el);
        expect(el.querySelector("a")?.getAttribute("href")).toBe("");
    });

    it("warn de on* sobre atributo compuesto", () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { });
        const el = document.createElement("div");
        html`<div onclick="do${"Something"}()">x</div>`.mount(el);
        expect(warn).toHaveBeenCalled();
        expect(warn.mock.calls[0][0]).toContain("onclick");
        warn.mockRestore();
    });

    it("style/aria/data parciales mantienen el threat model actual", () => {
        const el = document.createElement("div");
        html`<div style="color: ${"red"}" aria-label="a ${"b"}" data-x="x ${"y"}">x</div>`.mount(el);
        const div = el.querySelector("div")!;
        expect(div.getAttribute("style")).toBe("color: red");
        expect(div.getAttribute("aria-label")).toBe("a b");
        expect(div.getAttribute("data-x")).toBe("x y");
    });
});

// =============================================================================
// --- Fase 8: Matriz sintáctica: parcial vs binding completo ---
// =============================================================================

describe("matriz sintáctica: parcial vs binding completo", () => {
    const cases: Array<[string, string]> = [
        ['<div class="a ${"1"}">x</div>', '<div class=${"a 1"}>x</div>'],
        ['<div class="${"1"} b">x</div>', '<div class=${"1 b"}>x</div>'],
        ['<div class="a ${"1"} b">x</div>', '<div class=${"a 1 b"}>x</div>'],
        ['<div class="${"1"}${"2"}">x</div>', '<div class=${"12"}>x</div>'],
        ['<div class="${"1"} ${"2"} ${"3"}">x</div>', '<div class=${"1 2 3"}>x</div>'],
        ['<div id=pre-${"1"}>x</div>', '<div id=${"pre-1"}>x</div>'],
        ['<div id=${"1"}-post>x</div>', '<div id=${"1-post"}>x</div>'],
        ['<div id=pre-${"1"}-post>x</div>', '<div id=${"pre-1-post"}>x</div>'],
        ['<div class=\'a ${"1"}\'>x</div>', '<div class=${"a 1"}>x</div>'],
        ['<div data-a="x ${""} y">x</div>', '<div data-a=${"x  y"}>x</div>'],
        ['<input value="p ${"1"}">', '<input value=${"p 1"}>'],
        ['<a href="/a/${"b"}/c">x</a>', '<a href=${"/a/b/c"}>x</a>'],
        ['<img src="i-${"x"}.png" />', '<img src=${"i-x.png"} />'],
        ['<br class="x ${"y"}">', '<br class=${"x y"}>'],
        ['<my-el class="x ${"y"}">', '<my-el class=${"x y"}>'],
        ['<div title="say \'hi\' ${"x"}">x</div>', '<div title=${"say \'hi\' x"}>x</div>'],
        ['<div title="it\'s ${"x"}">x</div>', '<div title=${"it\'s x"}>x</div>'],
        ['<div\n class="a\n${"1"}\nb">x</div>', '<div class=${"a\n1\nb"}>x</div>'],
        ['<div class = "a ${"1"}">x</div>', '<div class=${"a 1"}>x</div>'],
        ['<input checked="x ${"y"}">', "ERR"],
    ];

    it.each(cases)("parcial: %s", (partial, reference) => {
        if (reference === "ERR") {
            expect(() => mountTemplateText(partial)).toThrow(/nix-js/);
            return;
        }
        const partialDOM = mountTemplateText(partial);
        const referenceDOM = mountTemplateText(reference);
        expect(partialDOM).toBe(referenceDOM);
    });

    it("contenido con <, =, saltos y Unicode en valores parciales", () => {
        const tpl = html`<div title="a ${"<b>=&"} c">x</div>`;
        const el = document.createElement("div");
        tpl.mount(el);
        expect(el.querySelector("div")?.getAttribute("title")).toBe("a <b>=& c");
    });

    it("escapes de template literal: backtick y ${ literal en estático", () => {
        const tpl = html`<div title="a\`b ${"x"} c">`;
        const el = document.createElement("div");
        tpl.mount(el);
        expect(el.querySelector("div")?.getAttribute("title")).toBe("a`b x c");
    });
});

// =============================================================================
// --- Fase 9: Bindings rechazados (parciales) ---
// =============================================================================

describe("bindings rechazados (parciales)", () => {
    it.each(["click", "click.prevent", "keydown.enter", "click.capture", "submit.prevent.stop"])(
        "evento parcial @%s lanza error descriptivo",
        (evt) => {
            const { strings, values } = splitTemplate(`<button @${evt}="x \${"y"}">`);
            expect(() => html(strings as unknown as TemplateStringsArray, ...values)).toThrow(
                /@click|@keydown|@submit/,
            );
        },
    );

    it("el error del evento incluye índice y forma correcta", () => {
        try {
            html`<button @click="x ${"y"}">`;
            throw new Error("should have thrown");
        } catch (e: any) {
            expect(e.message).toContain("@click");
            expect(e.message).toContain("binding index 0");
            expect(e.message).toContain("@click=${handler}");
        }
    });

    it.each(["ref", "show", "hide"])("directiva parcial %s lanza error", (dir) => {
        const { strings, values } = splitTemplate(`<div ${dir}="a \${"b"}">`);
        expect(() => html(strings as unknown as TemplateStringsArray, ...values)).toThrow(
            new RegExp(dir),
        );
    });

    const booleans = [
        "allowfullscreen", "async", "autofocus", "autoplay", "checked",
        "controls", "default", "defer", "disabled", "formnovalidate",
        "hidden", "inert", "ismap", "itemscope", "loop", "multiple",
        "muted", "nomodule", "novalidate", "open", "playsinline",
        "readonly", "required", "reversed", "selected",
    ];
    it.each(booleans)("boolean parcial %s lanza error", (attr) => {
        const { strings, values } = splitTemplate(`<input ${attr}="a \${"b"}">`);
        expect(() => html(strings as unknown as TemplateStringsArray, ...values)).toThrow(
            new RegExp(attr),
        );
    });

    it("error de boolean incluye forma correcta", () => {
        try {
            html`<input disabled="a ${"b"}">`;
            throw new Error("should have thrown");
        } catch (e: any) {
            expect(e.message).toContain("disabled=${condition}");
        }
    });

    it("las formas completas de booleanos siguen funcionando", () => {
        let el = document.createElement("div");
        html`<input type="checkbox" checked=${true} />`.mount(el);
        expect((el.querySelector("input") as HTMLInputElement).checked).toBe(true);
        el = document.createElement("div");
        html`<input disabled=${false} />`.mount(el);
        expect((el.querySelector("input") as HTMLInputElement).disabled).toBe(false);
        el = document.createElement("div");
        html`<input disabled=${true} />`.mount(el);
        expect((el.querySelector("input") as HTMLInputElement).disabled).toBe(true);
        el = document.createElement("div");
        html`<input type="checkbox" checked="${true}" />`.mount(el);
        expect((el.querySelector("input") as HTMLInputElement).checked).toBe(true);
    });

    it("las formas completas de eventos/directivas siguen funcionando", () => {
        const handler = vi.fn();
        const el = document.createElement("div");
        document.body.appendChild(el);
        const r = { el: null as HTMLElement | null };
        const tpl = html`<button @click=${handler} ref=${r}>x</button>`;
        tpl.mount(el);
        (el.querySelector("button") as HTMLElement).click();
        expect(handler).toHaveBeenCalledOnce();
        expect(r.el).not.toBeNull();
        const handle = tpl.mount(document.createElement("div"));
        handle.unmount();
        expect(r.el).toBeNull();
        document.body.removeChild(el);
    });

    it("aria-checked y ARIA no se confunden con booleanos HTML", () => {
        expect(mountHTML(html`<div aria-checked="a ${"b"}"></div>`)).toBe('<div aria-checked="a b"></div>');
        expect(mountHTML(html`<div aria-hidden="x ${"y"}"></div>`)).toBe('<div aria-hidden="x y"></div>');
        expect(mountHTML(html`<div data-checked="x ${"y"}"></div>`)).toBe('<div data-checked="x y"></div>');
    });

    it("tag name dinámico lanza error", () => {
        const s1 = splitTemplate(`<di\${"v"}>`);
        expect(() => html(s1.strings as unknown as TemplateStringsArray, ...s1.values)).toThrow(/tag name/i);
        const s2 = splitTemplate(`<\${"div"}>`);
        expect(() => html(s2.strings as unknown as TemplateStringsArray, ...s2.values)).toThrow(/tag name/i);
    });

    it("nombre de atributo dinámico lanza error", () => {
        const s = splitTemplate(`<div data-\${"x"}="1">`);
        expect(() => html(s.strings as unknown as TemplateStringsArray, ...s.values)).toThrow(/attribute name/i);
    });

    it("spread en tag body lanza error", () => {
        const s = splitTemplate(`<div \${"x"}>`);
        expect(() => html(s.strings as unknown as TemplateStringsArray, ...s.values)).toThrow(/attribute name/i);
    });
});

// =============================================================================
// --- Fase 10: Fuzzing determinista ---
// =============================================================================

describe("fuzzing determinista", () => {
    it("composición con String(part) como referencia", () => {
        let seed = 42;
        const rand = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        const pool = [
            0, 1, -1, 1.5, "a", "", " ", true, false, null, undefined, 10n,
            [1, "x"], { toString: () => "obj" },
        ];
        for (let trial = 0; trial < 150; trial++) {
            const count = 1 + Math.floor(rand() * 4);
            const strings: string[] = [`<div data-f="pre-`];
            const vals: unknown[] = [];
            for (let i = 0; i < count; i++) {
                vals.push(pool[Math.floor(rand() * pool.length)]);
                strings.push(i === count - 1 ? `">x</div>` : `-seg${i}-`);
            }
            const tpl = html(strings as unknown as TemplateStringsArray, ...vals);
            const expected =
                `pre-` +
                vals
                    .map((v, k) => String(v) + (k < count - 1 ? `-seg${k}-` : ""))
                    .join("");
            const el = document.createElement("div");
            tpl.mount(el);
            expect(el.querySelector("div")?.getAttribute("data-f")).toBe(expected);
        }
    });

    it("fuzz de secuencias de atributos/tags válidos: plan determinista", () => {
        let seed = 7;
        const rand = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        const templates = [
            '<div class="a ${"1"} b" id="c">x</div>',
            '<a href="/x/${"y"}" class="c ${"d"}">',
            '<svg><use xlink:href="#i-${"1"}"></use></svg>',
            '<textarea name="${"n"}">${"t"}</textarea>',
            '<script>const a=${"b"};</script>',
            '<!-- c --><p class="x ${"y"}">${"z"}</p>',
            '<input type="checkbox" data-id="x-${"1"}">',
            '<div style="color: ${"red"};">',
        ];
        for (let trial = 0; trial < 100; trial++) {
            const t = templates[Math.floor(rand() * templates.length)];
            const { strings, values } = splitTemplate(t);
            const p1 = analyzeTemplate(strings as unknown as TemplateStringsArray);
            const p2 = analyzeTemplate(strings as unknown as TemplateStringsArray);
            expect(p1.hasPartialAttributes).toBe(p2.hasPartialAttributes);
            expect(p1.normalizedStrings).toEqual(p2.normalizedStrings);
            void values;
        }
    });

    it("fuzz de updates reactivos y unmount sin escrituras tardías", async () => {
        let seed = 99;
        const rand = () => {
            seed = (seed * 1103515245 + 12345) & 0x7fffffff;
            return seed / 0x7fffffff;
        };
        for (let trial = 0; trial < 50; trial++) {
            const s = signal("v0");
            const el = document.createElement("div");
            const tpl = html`<div class="x-${() => s.value}-static">y</div>`;
            const handle = tpl.mount(el);
            const div = el.querySelector("div")!;
            const updates = 1 + Math.floor(rand() * 5);
            for (let u = 0; u < updates; u++) {
                s.value = `v${u + 1}`;
            }
            await nextTick();
            expect(div.className).toBe(`x-v${updates}-static`);
            handle.unmount();
            s.value = "late";
            await nextTick();
            expect(div.className).toBe(`x-v${updates}-static`);
        }
    });

    it("fuzz de caracteres de control y Unicode en valores", () => {
        const values = ["\u0000", "\u0007", "\u001f", "\u007f", "\u2028", "\u2029", "\uFEFF", "ñ", "🎉", "é\u0301"];
        for (const v of values) {
            const el = document.createElement("div");
            html`<div data-x="a${v}b">`.mount(el);
            expect(el.querySelector("div")?.getAttribute("data-x")).toBe(`a${v}b`);
        }
    });
});


// =============================================================================
// --- Casos malformados y edge ---
// =============================================================================

describe("edge cases", () => {
    it("comilla sin cerrar lanza error descriptivo", () => {
        expect(() => html`<div class="a ${"b"}>`).toThrow(/Unclosed quoted attribute value/);
        expect(() => html`<div class="a ${"b"}`).toThrow(/Unclosed quoted attribute value/);
    });

    it("valor unquoted parcial al final con tag cerrado", () => {
        const el = document.createElement("div");
        html`<div id=foo-${"bar"}>`.mount(el);
        expect(el.querySelector("div")?.getAttribute("id")).toBe("foo-bar");
    });

    it("SSR parity para valor unquoted parcial", async () => {
        const tpl = html`<div id=foo-${"bar"}>`;
        const container = document.createElement("div");
        container.innerHTML = await renderToString(tpl, { markers: "hydration" });
        hydrate(tpl, container);
        expect(container.querySelector("div")?.getAttribute("id")).toBe("foo-bar");
    });

    it("tag sin cerrar (unquoted): comportamiento determinista preservado (sin crash)", () => {
        const el = document.createElement("div");
        expect(() => html`<div id=foo-${"x"} trailing`.mount(el)).not.toThrow();
    });

    it("comentario + parcial", () => {
        const el = document.createElement("div");
        html`<!-- c --><p class="a ${"b"}">x</p>`.mount(el);
        expect(el.querySelector("p")?.className).toBe("a b");
    });

    it("parcial con < > & dentro del valor en SSR", async () => {
        const tpl = html`<div title="a ${"<b>&"} c">`;
        expect(await renderToString(tpl)).toBe('<div title="a &lt;b&gt;&amp; c">');
    });

    it("signal en parcial dentro de repeat reactivo", async () => {
        const items = signal([{ id: 1 }, { id: 2 }]);
        const tpl = html`<ul>${() => items.value.map((i) => html`<li data-id="id-${i.id}">${String(i.id)}</li>`)}</ul>`;
        const el = document.createElement("div");
        tpl.mount(el);
        expect(el.querySelectorAll("li").length).toBe(2);
        items.value = [{ id: 3 }, { id: 4 }, { id: 5 }];
        await nextTick();
        expect(el.querySelectorAll("li").length).toBe(3);
        expect(el.querySelector("li")?.getAttribute("data-id")).toBe("id-3");
    });

    it("tabla con celdas que contienen < y = en texto", () => {
        const el = document.createElement("div");
        html`<table><tr><td>a < b = c</td><td class="x ${"y"}">d</td></tr></table>`.mount(el);
        expect(el.querySelector("td")?.textContent).toBe("a < b = c");
        expect(el.querySelector("td:last-child")?.className).toBe("x y");
    });
});

// =============================================================================
// --- Descriptor y contrato público ---
// =============================================================================

describe("descriptor y contrato público", () => {
    it("templates sin parciales: descriptor sin cambios", () => {
        const tpl = html`<div class="${"x"}">${"y"}</div>`;
        const d = descriptorOf(tpl);
        expect(d.version).toBe(1);
        expect(d.strings).toHaveLength(3);
        expect(d.contexts).toHaveLength(2);
        expect(d.contexts[0]).toMatchObject({ type: "attr", attrName: "class", hadOpenQuote: true });
        expect(d.contexts[1]).toEqual({ type: "node" });
    });

    it("templates con parciales: descriptor canónico version 1", () => {
        const tpl = html`<div class="a ${"x"} b" id=${"i"}>`;
        const d = descriptorOf(tpl);
        expect(d.version).toBe(1);
        expect(d.strings).toEqual(['<div class="', '" id=', '>']);
        expect(d.contexts).toHaveLength(2);
        expect(d.contexts[0]).toMatchObject({ type: "attr", attrName: "class", hadOpenQuote: true });
        expect(d.contexts[1]).toMatchObject({ type: "attr", attrName: "id" });
        expect(String(d.values[0])).toBe("a x b");
    });

    it("descriptor.values compone un solo binding por atributo", () => {
        const tpl = html`<div title="x ${1} y ${2}">`;
        const d = descriptorOf(tpl);
        expect(d.values).toHaveLength(1);
        expect(String(d.values[0])).toBe("x 1 y 2");
    });

    it("capability pública templateFeatures", () => {
        expect(templateFeatures.partialAttributeInterpolation).toBe(true);
    });

    it("buildCanonicalValues devuelve las values originales en fast path", () => {
        const strs = ["<div class=\"", "\">"] as unknown as TemplateStringsArray;
        const plan = analyzeTemplate(strs);
        const values = ["x"];
        expect(buildCanonicalValues(plan, values)).toBe(values);
    });

    it("composición estática ocurre en html(), no por render", () => {
        let toStringCalls = 0;
        const obj = { toString: () => { toStringCalls++; return "static"; } };
        const tpl = html`<div data-x="a ${obj} b">`;
        const d = descriptorOf(tpl);
        expect(String(d.values[0])).toBe("a static b");
        expect(typeof d.values[0]).toBe("string");
        expect(toStringCalls).toBe(1);
    });
});