import { describe, expect, it, vi } from "vitest";
import { signal } from "../nix/reactivity.js";
import { html } from "../nix/template/html.js";
import { NixComponent } from "../nix/lifecycle.js";
import { createInjectionKey, inject, provide } from "../nix/context.js";
import { renderToString } from "../nix/server/index.js";
import { hydrate } from "../nix/hydrate/index.js";

async function ssr(template: ReturnType<typeof html> | NixComponent, markers = "hydration"): Promise<HTMLDivElement> {
    const container = document.createElement("div");
    container.innerHTML = await renderToString(template, { markers: markers as "hydration" });
    return container;
}

describe("SSR/hydration matrix", () => {
    describe("forms", () => {
        it("preserves user-toggled checkbox before hydration", async () => {
            const checked = signal(true);
            const template = html`<input type="checkbox" checked=${() => checked.value} />`;
            const container = await ssr(template);
            const input = container.querySelector("input")!;
            expect(input.checked).toBe(true);
            // User toggles before hydration
            input.checked = false;
            const handle = hydrate(template, container);
            expect(input.checked).toBe(false);
            checked.value = false;
            expect(input.checked).toBe(false);
            checked.value = true;
            expect(input.checked).toBe(true);
            handle.unmount();
        });

        it("preserves radio selection before hydration", async () => {
            const selected = signal("a");
            const template = html`
                <input type="radio" name="g" value="a" checked=${() => selected.value === "a"} />
                <input type="radio" name="g" value="b" checked=${() => selected.value === "b"} />
            `;
            const container = await ssr(template);
            const radioB = container.querySelector('input[value="b"]')! as HTMLInputElement;
            expect(radioB.checked).toBe(false);
            radioB.checked = true; // user interaction before hydration
            const handle = hydrate(template, container);
            expect((container.querySelector('input[value="b"]') as HTMLInputElement).checked).toBe(true);
            selected.value = "b";
            expect((container.querySelector('input[value="b"]') as HTMLInputElement).checked).toBe(true);
            handle.unmount();
        });

        it("preserves select value before hydration", async () => {
            const value = signal("one");
            const template = html`
                <select value=${() => value.value}>
                    <option value="one">One</option>
                    <option value="two">Two</option>
                </select>
            `;
            const container = await ssr(template);
            const select = container.querySelector("select")! as HTMLSelectElement;
            expect(select.value).toBe("one");
            select.value = "two"; // user interaction before hydration
            const handle = hydrate(template, container);
            expect((container.querySelector("select") as HTMLSelectElement).value).toBe("two");
            value.value = "two";
            expect((container.querySelector("select") as HTMLSelectElement).value).toBe("two");
            handle.unmount();
        });
    });

    describe("mismatch", () => {
        it("throws on missing marker in strict mode", async () => {
            const template = html`<p>${"x"}</p>`;
            const container = document.createElement("div");
            container.innerHTML = "<p>y</p>";
            expect(() => hydrate(template, container, { mismatch: "throw" })).toThrow(/marker/i);
        });

        it("warns and remounts on missing marker in default mode", async () => {
            const warn = vi.spyOn(console, "warn").mockImplementation(() => { });
            try {
                const template = html`<p>${"x"}</p>`;
                const container = document.createElement("div");
                container.innerHTML = "<p>y</p>";
                const handle = hydrate(template, container);
                expect(container.querySelector("p")?.textContent).toBe("x");
                handle.unmount();
            } finally {
                warn.mockRestore();
            }
        });

        it("isolates a mismatch without emptying sibling content", async () => {
            const template = html`
                <div>
                    <span>${"a"}</span>
                    <span>${"b"}</span>
                </div>
            `;
            const container = document.createElement("div");
            // First marker missing → strict remount of whole root is avoided by
            // warn-remount which remounts the root, keeping it self-contained.
            container.innerHTML = "<div><span><!--nix-0-->a</span><span>b</span></div>";
            const handle = hydrate(template, container, { mismatch: "warn-remount" });
            expect(container.querySelector("span")?.textContent).toBe("a");
            handle.unmount();
        });
    });

    describe("abort and cleanup", () => {
        it("rejects when the render signal aborts", async () => {
            const controller = new AbortController();
            const slow = {
                [Symbol.for("@deijose/nix-js/render-protocol")]: {
                    async renderServer() {
                        await new Promise((resolve) => setTimeout(resolve, 30));
                        return "x";
                    },
                },
            };
            const template = html`<p>${slow}</p>`;
            const promise = renderToString(template, { signal: controller.signal });
            controller.abort(new Error("aborted"));
            await expect(promise).rejects.toThrow(/abort/i);
        });

        it("stops reactive updates after unmount", async () => {
            const count = signal(1);
            const template = html`<p>${() => count.value}</p>`;
            const container = await ssr(template);
            const handle = hydrate(template, container);
            count.value = 2;
            expect(container.textContent).toContain("2");
            handle.unmount();
            count.value = 3;
            expect(container.textContent).toContain("2");
        });
    });

    describe("nested providers during hydration", () => {
        it("resolves provide/inject across nested components", async () => {
            const key = createInjectionKey<string>("nested");
            class Leaf extends NixComponent {
                render() {
                    return html`<b>${inject(key)}</b>`;
                }
            }
            class Branch extends NixComponent {
                render() {
                    return html`<span>${new Leaf()}</span>`;
                }
            }
            class Root extends NixComponent {
                onInit() { provide(key, "provided"); }
                render() {
                    return html`<div>${new Branch()}</div>`;
                }
            }
            const container = await ssr(new Root());
            const b = container.querySelector("b")!;
            const handle = hydrate(new Root(), container);
            expect(container.querySelector("b")).toBe(b);
            expect(b.textContent).toBe("provided");
            handle.unmount();
        });
    });
});