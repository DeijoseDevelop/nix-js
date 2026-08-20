import { describe, expect, it } from "vitest";
import { html } from "../nix/template/html.js";
import { repeat } from "../nix/template/keyed.js";
import { NixComponent } from "../nix/lifecycle.js";
import { renderToString, renderToChunks, createServerRenderScope } from "../nix/server/index.js";
import { createInjectionKey, inject, provide } from "../nix/context.js";

function concat(chunks: AsyncIterable<{ value: string }>): Promise<string> {
    let out = "";
    return (async () => {
        for await (const chunk of chunks) out += chunk.value;
        return out;
    })();
}

describe("renderToChunks", () => {
    it("produces the same output as renderToString", async () => {
        const items = [{ id: "a", n: 1 }, { id: "b", n: 2 }];
        const template = html`
            <ul>
                ${repeat(items, (item) => item.id, (item) => html`<li>${item.n}</li>`)}
            </ul>
        `;
        const full = await renderToString(template, { markers: "hydration" });
        const chunked = await concat(renderToChunks(template, { markers: "hydration" }));
        expect(chunked).toBe(full);
    });

    it("yields incremental markup chunks", async () => {
        const template = html`
            <div>
                ${"hello"}
                ${"world"}
            </div>
        `;
        const collected: string[] = [];
        for await (const chunk of renderToChunks(template)) {
            if (chunk.type === "markup") collected.push(chunk.value);
        }
        expect(collected.join("")).toBe(await renderToString(template));
        // Multiple chunks imply incremental emission.
        expect(collected.length).toBeGreaterThan(1);
    });

    it("reports done and errors as typed chunks", async () => {
        const template = html`<p>${"x"}</p>`;
        const types: string[] = [];
        for await (const chunk of renderToChunks(template)) {
            types.push(chunk.type);
        }
        expect(types[types.length - 1]).toBe("done");
        expect(types).toContain("markup");
    });

    it("aborts a slow render through the scope", async () => {
        const scope = createServerRenderScope();
        const slow = {
            [Symbol.for("@deijose/nix-js/render-protocol")]: {
                async renderServer() {
                    await new Promise((resolve) => setTimeout(resolve, 200));
                    return "late";
                },
            },
        };
        const template = html`<p>${slow}</p>`;
        const promise = scope.render(template);
        scope.abort(new Error("cancelled"));
        await expect(promise).rejects.toThrow(/abort|cancelled/i);
        expect(scope.signal.aborted).toBe(true);
    });

    it("isolates provide/inject across concurrent scope renders", async () => {
        const key = createInjectionKey<string>("scope-key");
        class Child extends NixComponent {
            render() {
                return html`<span>${inject(key)}</span>`;
            }
        }
        class Parent extends NixComponent {
            private value: string;
            constructor(value: string) {
                super();
                this.value = value;
            }
            onInit() { provide(key, this.value); }
            render() {
                return html`<main>${new Child()}</main>`;
            }
        }
        const [a, b] = await Promise.all([
            renderToString(new Parent("first")),
            renderToString(new Parent("second")),
        ]);
        expect(a).toContain("first");
        expect(b).toContain("second");
    });
});

describe("server lifecycle and error info", () => {
    it("runs onServerRender after onInit during SSR only", async () => {
        const calls: string[] = [];
        class ServerOnly extends NixComponent {
            onInit() { calls.push("init"); }
            onServerRender() { calls.push("server"); }
            onMount() { calls.push("mount"); }
            render() {
                return html`<p>${"ok"}</p>`;
            }
        }
        const out = await renderToString(new ServerOnly());
        expect(out).toBe("<p>ok</p>");
        expect(calls).toEqual(["init", "server"]);
    });

    it("passes RenderErrorInfo to onError", async () => {
        const errors: unknown[] = [];
        const throwing = {
            [Symbol.for("@deijose/nix-js/render-protocol")]: {
                renderServer() {
                    throw new Error("boom");
                },
            },
        };
        await expect(
            renderToString(html`<div>${throwing}</div>`, {
                onError: (err, info) => errors.push({ err, info }),
            }),
        ).rejects.toThrow(/boom/);
        expect(errors.length).toBeGreaterThan(0);
        const first = errors[0] as { info: { index: number; context: string } };
        expect(first.info.context).toBe("node");
    });
});