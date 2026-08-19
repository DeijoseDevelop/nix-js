import { describe, expect, it } from "vitest";
import { signal } from "../nix/reactivity";
import { html } from "../nix/template/html";
import { ref } from "../nix/template/types";
import { renderToString } from "../nix/server";
import { hydrate } from "../nix/hydrate";

describe("hydrate", () => {
    it("adopts server DOM and connects events without replacing nodes", async () => {
        let clicks = 0;
        const template = html`
            <button @click=${() => { clicks++; }}>${"Save"}</button>
        `;
        const container = document.createElement("div");
        container.innerHTML = await renderToString(template, { markers: "hydration" });
        const button = container.querySelector("button")!;

        const handle = hydrate(template, container);
        expect(container.querySelector("button")).toBe(button);
        button.click();
        expect(clicks).toBe(1);
        handle.unmount();
        button.click();
        expect(clicks).toBe(1);
    });

    it("preserves user-modified input value and focus", async () => {
        const value = signal("server");
        const inputRef = ref<HTMLInputElement>();
        const template = html`
            <input value=${() => value.value} ref=${inputRef} />
        `;
        const container = document.createElement("div");
        document.body.appendChild(container);
        container.innerHTML = await renderToString(template, { markers: "hydration" });
        const input = container.querySelector("input")!;
        input.value = "typed-before-hydration";
        input.focus();

        const handle = hydrate(template, container);
        expect(container.querySelector("input")).toBe(input);
        expect(input.value).toBe("typed-before-hydration");
        expect(document.activeElement).toBe(input);
        expect(inputRef.el).toBe(input);

        value.value = "after";
        expect(input.value).toBe("after");
        handle.unmount();
        expect(inputRef.el).toBeNull();
        container.remove();
    });

    it("updates reactive text while preserving the original text node", async () => {
        const count = signal(1);
        const template = html`
            <p>
                ${() => count.value}
            </p>
        `;
        const container = document.createElement("div");
        container.innerHTML = await renderToString(template, { markers: "hydration" });
        const boundText = () => Array.from(container.querySelector("p")!.childNodes)
            .find((node) => node.nodeType === Node.TEXT_NODE && node.nodeValue?.trim() !== "");
        const text = boundText();

        hydrate(template, container);
        expect(boundText()).toBe(text);
        count.value = 2;
        expect(container.querySelector("p")!.textContent?.trim()).toBe("2");
        expect(boundText()).toBe(text);
    });

    it("throws on marker mismatch in strict mode", () => {
        const template = html`
            <p>
                ${"missing markers"}
            </p>
        `;
        const container = document.createElement("div");
        container.innerHTML = "<p>missing markers</p>";
        expect(() => hydrate(template, container, { mismatch: "throw" })).toThrow(/marker/i);
    });
});
