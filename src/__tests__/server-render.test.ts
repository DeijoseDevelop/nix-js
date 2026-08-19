import { describe, expect, it } from "vitest";
import { html } from "../nix/template/html";
import { NIX_RENDER_PROTOCOL } from "../nix/template/types";
import { createInjectionKey, inject, provide } from "../nix/context";
import { NixComponent } from "../nix/lifecycle";
import { renderToString } from "../nix/server";

function compact(value: string): string {
    return value.replace(/\s+/g, " ").replace(/> /g, ">").replace(/ </g, "<").trim();
}

describe("server renderer", () => {
    it("creates and renders templates without document", async () => {
        const originalDocument = globalThis.document;
        Object.assign(globalThis, { document: undefined });
        try {
            const template = html`
                <main>
                    ${"Hello"}
                </main>
            `;
            expect(compact(await renderToString(template))).toBe("<main>Hello</main>");
        } finally {
            Object.assign(globalThis, { document: originalDocument });
        }
    });

    it("escapes text and attributes and omits event bindings", async () => {
        const template = html`
            <button title=${'a"<b>'} @click=${() => { }}>${"<strong>unsafe</strong>"}</button>
        `;
        expect(compact(await renderToString(template))).toBe(
            '<button title="a&quot;&lt;b&gt;">&lt;strong&gt;unsafe&lt;/strong&gt;</button>',
        );
    });

    it("evaluates reactive functions once per server render", async () => {
        let evaluations = 0;
        const template = html`
            <p>
                ${() => {
                evaluations++;
                return "value";
            }}
            </p>
        `;
        expect(compact(await renderToString(template))).toBe("<p>value</p>");
        expect(evaluations).toBe(1);
    });

    it("renders nested templates, arrays and empty values", async () => {
        const nested = html`
            <span>${"nested"}</span>
        `;
        const template = html`
            <div>
                ${[nested, "text", null, false, 3]}
            </div>
        `;
        expect(compact(await renderToString(template))).toBe("<div><span>nested</span>text3</div>");
    });

    it("renders class components without running DOM lifecycle hooks", async () => {
        const calls: string[] = [];
        class ServerComponent extends NixComponent {
            onInit() { calls.push("init"); }
            onMount() { calls.push("mount"); }
            render() {
                return html`
                    <section>
                        ${"component"}
                    </section>
                `;
            }
        }
        expect(compact(await renderToString(new ServerComponent()))).toBe("<section>component</section>");
        expect(calls).toEqual(["init"]);
    });

    it("renders custom values through the server protocol", async () => {
        const custom = {
            [NIX_RENDER_PROTOCOL]: {
                async renderServer(context: { render(value: unknown): Promise<string> }) {
                    return `<aside>${await context.render(html`
                        <b>${"protocol"}</b>
                    `)}</aside>`;
                },
            },
        };
        expect(compact(await renderToString(html`
            <main>
                ${custom}
            </main>
        `))).toBe("<main><aside><b>protocol</b></aside></main>");
    });

    it("isolates component context across concurrent renders", async () => {
        const key = createInjectionKey<string>("request-value");
        class Child extends NixComponent {
            render() {
                return html`
                    <span>${inject(key)}</span>
                `;
            }
        }
        class Parent extends NixComponent {
            private value: string;
            private delay: number;
            constructor(value: string, delay: number) {
                super();
                this.value = value;
                this.delay = delay;
            }
            onInit() { provide(key, this.value); }
            render() {
                return html`
                    <main>
                        ${{
                        [NIX_RENDER_PROTOCOL]: {
                            renderServer: async (context: { render(value: unknown): Promise<string> }) => {
                                await new Promise((resolve) => setTimeout(resolve, this.delay));
                                return context.render(new Child());
                            },
                        },
                    }}
                    </main>
                `;
            }
        }

        const [first, second] = await Promise.all([
            renderToString(new Parent("first", 0)),
            renderToString(new Parent("second", 20)),
        ]);
        expect(compact(first)).toBe("<main><span>first</span></main>");
        expect(compact(second)).toBe("<main><span>second</span></main>");
    });

    it("emits deterministic hydration markers only when requested", async () => {
        const template = html`
            <button @click=${() => { }} class=${"primary"}>${"Save"}</button>
        `;
        const rendered = await renderToString(template, { markers: "hydration" });
        expect(rendered).toContain('data-nix-e-0="click"');
        expect(rendered).toContain('data-nix-a-1="class"');
        expect(rendered).toContain("<!--nix-2-->");
        expect(rendered).toContain("<!--nix-end-2-->");
    });
});
