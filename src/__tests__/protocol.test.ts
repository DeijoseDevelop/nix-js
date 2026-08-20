import { describe, expect, it } from "vitest";
import { html } from "../nix/template/html.js";
import { raw } from "../nix/template/raw.js";
import { NIX_RENDER_PROTOCOL } from "../nix/template/types.js";
import { renderToString } from "../nix/server/index.js";
import { hydrate } from "../nix/hydrate/index.js";

function compact(value: string): string {
    return value.replace(/\s+/g, " ").replace(/> /g, ">").replace(/ </g, "<").trim();
}

describe("trusted raw HTML protocol", () => {
    it("renders raw HTML unescaped on the server", async () => {
        const template = html`
            <div>
                ${raw("<strong>bold & trusted</strong>")}
            </div>
        `;
        expect(compact(await renderToString(template))).toBe(
            "<div><strong>bold & trusted</strong></div>",
        );
    });

    it("mounts raw HTML on the client and cleans up on unmount", () => {
        const template = html`
            <div>
                ${raw("<strong>client</strong>")}
            </div>
        `;
        const container = document.createElement("div");
        const handle = template.mount(container);
        expect(container.querySelector("strong")?.textContent).toBe("client");
        handle.unmount();
        expect(container.querySelector("strong")).toBeNull();
    });

    it("hydrates raw SSR HTML without replacing nodes", async () => {
        const content = "<em>server</em>";
        const template = html`
            <div>
                ${raw(content)}
            </div>
        `;
        const container = document.createElement("div");
        container.innerHTML = await renderToString(template, { markers: "hydration" });
        const em = container.querySelector("em")!;
        const handle = hydrate(template, container);
        expect(container.querySelector("em")).toBe(em);
        handle.unmount();
    });
});

describe("custom mountDom/hydrateDom protocols", () => {
    it("calls mountDom during client mount", () => {
        const custom = {
            [NIX_RENDER_PROTOCOL]: {
                mountDom({ parent, before }: { parent: Node; before: Node | null }) {
                    const node = document.createElement("span");
                    node.textContent = "custom";
                    parent.insertBefore(node, before);
                    return () => node.parentNode?.removeChild(node);
                },
            },
        };
        const template = html`<p>${custom}</p>`;
        const container = document.createElement("div");
        const handle = template.mount(container);
        expect(container.querySelector("span")?.textContent).toBe("custom");
        handle.unmount();
        expect(container.querySelector("span")).toBeNull();
    });

    it("calls hydrateDom during hydration and uses SSR DOM", async () => {
        let hydrated = false;
        const custom = {
            [NIX_RENDER_PROTOCOL]: {
                renderServer() {
                    return "<b data-custom>proto</b>";
                },
                hydrateDom({ bounds }: { bounds: { start: Comment; end: Comment } | null }) {
                    hydrated = true;
                    expect(bounds).not.toBeNull();
                    return () => { };
                },
            },
        };
        const template = html`<div>${custom}</div>`;
        const container = document.createElement("div");
        container.innerHTML = await renderToString(template, { markers: "hydration" });
        const b = container.querySelector("b")!;
        const handle = hydrate(template, container);
        expect(hydrated).toBe(true);
        expect(container.querySelector("b")).toBe(b);
        handle.unmount();
    });
});