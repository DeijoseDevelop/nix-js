import { describe, it, expect } from "vitest";
import { html } from "../nix/template/html.js";
import { hydrate } from "../nix/hydrate/index.js";
import { renderToString } from "../nix/server/index.js";

// =============================================================================
// Unified event delegation in hydration
// =============================================================================
// The hydrator must use the same global _delegatedRegistry as mount-time
// bindings, not addEventListener directly.

async function ssr(template: ReturnType<typeof html>): Promise<HTMLDivElement> {
    const container = document.createElement("div");
    container.innerHTML = await renderToString(template, { markers: "hydration" });
    // The container must be in the document for event delegation to work
    // (delegated events are registered on `document`).
    document.body.appendChild(container);
    return container;
}

describe("Fix #3: Event delegation in hydration", () => {
    it("delegated click event fires after hydration", async () => {
        let clicked = false;
        const handler = () => { clicked = true; };

        const template = html`
            <button @click=${handler}>Click me</button>
        `;
        const container = await ssr(template);
        const handle = hydrate(template, container);

        const button = container.querySelector("button")!;
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        expect(clicked).toBe(true);
        handle.unmount();
        container.remove();
    });

    it("delegated input event fires after hydration", async () => {
        let value = "";
        const handler = (e: Event) => { value = (e.target as HTMLInputElement).value; };

        const template = html`
            <input @input=${handler} type="text" />
        `;
        const container = await ssr(template);
        const handle = hydrate(template, container);

        const input = container.querySelector("input")!;
        input.value = "hello";
        input.dispatchEvent(new Event("input", { bubbles: true }));

        expect(value).toBe("hello");
        handle.unmount();
        container.remove();
    });

    it("delegated change event fires after hydration", async () => {
        let changed = false;
        const handler = () => { changed = true; };

        const template = html`
            <select @change=${handler}>
            <option>
                A
            </option>
            </select>
        `;
        const container = await ssr(template);
        const handle = hydrate(template, container);

        const select = container.querySelector("select")!;
        select.dispatchEvent(new Event("change", { bubbles: true }));

        expect(changed).toBe(true);
        handle.unmount();
        container.remove();
    });

    it("non-delegable event (custom) still works via addEventListener", async () => {
        let fired = false;
        const handler = () => { fired = true; };

        // 'custom-event' is not in DELEGABLE_EVENTS
        const template = html`
            <div @custom-event=${handler}>
                Test
            </div>
        `;
        const container = await ssr(template);
        const handle = hydrate(template, container);

        const div = container.querySelector("div")!;
        div.dispatchEvent(new Event("custom-event", { bubbles: true }));

        expect(fired).toBe(true);
        handle.unmount();
        container.remove();
    });

    it("delegated event with modifiers (prevent) works after hydration", async () => {
        let clicked = false;
        const handler = () => { clicked = true; };

        const template = html`
            <button @click.prevent=${handler}>Click</button>
        `;
        const container = await ssr(template);
        const handle = hydrate(template, container);

        const button = container.querySelector("button")!;
        button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));

        // The handler should fire (preventDefault is a modifier, not a blocker)
        expect(clicked).toBe(true);
        handle.unmount();
        container.remove();
    });
});
