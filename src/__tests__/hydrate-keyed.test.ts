import { describe, expect, it, vi } from "vitest";
import { signal, type Signal } from "../nix/reactivity.js";
import { html } from "../nix/template/html.js";
import { repeat } from "../nix/template/keyed.js";
import { NixComponent } from "../nix/lifecycle.js";
import { renderToString } from "../nix/server/index.js";
import { hydrate } from "../nix/hydrate/index.js";

// Helper: SSR + mount into a container and return container.
async function ssr(template: ReturnType<typeof html>): Promise<HTMLDivElement> {
    const container = document.createElement("div");
    container.innerHTML = await renderToString(template, { markers: "hydration" });
    return container;
}

describe("hydrate: keyed repeat()", () => {
    it("emits keyed hydration markers during SSR", async () => {
        const items = signal([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
        const template = html`
            <ul>${() => repeat(items.value, (item) => item.id, (item) => html`<li>${item.n}</li>`)}</ul>
        `;
        const rendered = await renderToString(template, { markers: "hydration" });
        expect(rendered).toContain("<!--nix-ki:");
        expect(rendered).toContain("<!--nix-ke-->");
        expect((rendered.match(/<li>/g) ?? [])).toHaveLength(2);
        expect(rendered).toContain(">1<");
        expect(rendered).toContain(">2<");
        // Without markers there are no keyed markers.
        const plain = await renderToString(template, { markers: "none" });
        expect(plain).not.toContain("nix-ki:");
    });

    it("adopts SSR nodes and updates reactive content while preserving identity", async () => {
        const store = new Map<string, Signal<number>>();
        const make = (id: string, n: number) => {
            const s = signal(n);
            store.set(id, s);
            return { id, n: s };
        };
        const items = signal([make("a", 1), make("b", 2)]);
        const template = html`
            <ul>${() => repeat(items.value, (item) => item.id, (item) => html`<li data-id="${item.id}">${() => item.n.value}</li>`)}</ul>
        `;
        const container = await ssr(template);
        const liA = container.querySelector('[data-id="a"]')!;
        const liB = container.querySelector('[data-id="b"]')!;

        const handle = hydrate(template, container);
        expect(container.querySelector('[data-id="a"]')).toBe(liA);

        // Reorder: same objects, new order → identity preserved.
        items.value = [items.value[1], items.value[0]];
        const after = Array.from(container.querySelectorAll("li"));
        expect(after[0]).toBe(liB);
        expect(after[1]).toBe(liA);
        // Reactive content updates inside surviving nodes.
        store.get("b")!.value = 22;
        expect(after[0].textContent).toBe("22");
        handle.unmount();
    });

    it("adds and removes items without recreating survivors", async () => {
        const items = signal([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
        const template = html`
            <ul>${() => repeat(items.value, (item) => item.id, (item) => html`<li>${item.n}</li>`)}</ul>
        `;
        const container = await ssr(template);
        const liA = container.querySelector("li")!;
        const liB = liA.nextElementSibling as HTMLLIElement;

        const handle = hydrate(template, container);
        // Remove "a", add "c"
        items.value = [{ id: "c", n: 3 }, { id: "b", n: 2 }];
        const after = Array.from(container.querySelectorAll("li"));
        expect(after).toHaveLength(2);
        expect(after[0].textContent).toBe("3");
        expect(after[1]).toBe(liB);
        // "a" removed from DOM
        expect(container.textContent).not.toContain("1");
        handle.unmount();
    });

    it("handles empty list growth from empty SSR", async () => {
        const items = signal<Array<{ id: string; n: number }>>([]);
        const template = html`
            <ul>${() => repeat(items.value, (item) => item.id, (item) => html`<li>${item.n}</li>`)}</ul>
        `;
        const container = await ssr(template);
        const handle = hydrate(template, container);
        expect(container.querySelectorAll("li")).toHaveLength(0);

        items.value = [{ id: "a", n: 1 }, { id: "b", n: 2 }];
        const lis = Array.from(container.querySelectorAll("li"));
        expect(lis.map((li) => li.textContent)).toEqual(["1", "2"]);
        handle.unmount();
    });

    it("runs component lifecycle exactly once per item on hydrate and unmount", async () => {
        const calls: string[] = [];
        class Item extends NixComponent {
            private n: number;
            private id: string;
            constructor(n: number, id: string) {
                super();
                this.n = n;
                this.id = id;
            }
            onInit() { calls.push(`init:${this.id}`); }
            onMount() { calls.push(`mount:${this.id}`); }
            onUnmount() { calls.push(`unmount:${this.id}`); }
            render() {
                return html`<li>${this.n}</li>`;
            }
        }
        const items = signal([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
        const template = html`
            <ul>${() => repeat(items.value, (item) => item.id, (item) => new Item(item.n, item.id))}</ul>
        `;
        // SSR itself creates server-side instances (onInit runs there too).
        const container = await ssr(template);
        expect(calls.filter((c) => c.startsWith("init"))).toEqual(["init:a", "init:b"]);

        const handle = hydrate(template, container);
        // Hydration creates fresh client instances (onInit) and mounts them once.
        expect(calls.filter((c) => c.startsWith("init"))).toEqual(["init:a", "init:b", "init:a", "init:b"]);
        expect(calls.filter((c) => c.startsWith("mount"))).toEqual(["mount:a", "mount:b"]);

        // Reorder → survivors keep their instances (no re-init beyond the two above).
        items.value = [items.value[1], items.value[0]];
        expect(calls.filter((c) => c.startsWith("mount"))).toEqual(["mount:a", "mount:b"]);

        handle.unmount();
        expect(calls.filter((c) => c.startsWith("unmount"))).toEqual(["unmount:a", "unmount:b"]);
    });

    it("removes orphan SSR markers when client data shrank", async () => {
        const items = signal([{ id: "a", n: 1 }]);
        const template = html`
            <ul>${() => repeat(items.value, (item) => item.id, (item) => html`<li>${item.n}</li>`)}</ul>
        `;
        const container = await ssr(template);
        expect(container.querySelectorAll("li")).toHaveLength(1);
        const handle = hydrate(template, container);
        expect(container.querySelectorAll("li")).toHaveLength(1);
        expect(container.textContent).toContain("1");
        handle.unmount();
    });

    it("inserts client items missing from SSR", async () => {
        const items = signal([{ id: "a", n: 1 }, { id: "b", n: 2 }, { id: "c", n: 3 }]);
        const template = html`
            <ul>${() => repeat(items.value, (item) => item.id, (item) => html`<li>${item.n}</li>`)}</ul>
        `;
        const container = await ssr(template);
        expect(container.querySelectorAll("li")).toHaveLength(3);
        const handle = hydrate(template, container);
        expect(Array.from(container.querySelectorAll("li")).map((li) => li.textContent)).toEqual(["1", "2", "3"]);
        handle.unmount();
    });

    it("warns on duplicate keys during SSR hydration", async () => {
        const warn = vi.spyOn(console, "warn").mockImplementation(() => { });
        try {
            const items = signal([{ id: "a", n: 1 }, { id: "a", n: 2 }]);
            const template = html`
                <ul>${() => repeat(items.value, (item) => item.id, (item) => html`<li>${item.n}</li>`)}</ul>
            `;
            const container = await ssr(template);
            hydrate(template, container);
            expect(warn).toHaveBeenCalled();
            const joined = warn.mock.calls.map((c) => String(c[0])).join(" ");
            expect(joined).toMatch(/duplicate/i);
        } finally {
            warn.mockRestore();
        }
    });

    it("adopts by key even when SSR order differs from client order", async () => {
        const items = signal([{ id: "a", n: 1 }, { id: "b", n: 2 }]);
        const template = html`
            <ul>${() => repeat(items.value, (item) => item.id, (item) => html`<li data-id="${item.id}">${item.n}</li>`)}</ul>
        `;
        const container = await ssr(template);
        const liA = container.querySelector('[data-id="a"]')!;
        const liB = container.querySelector('[data-id="b"]')!;
        const handle = hydrate(template, container);
        // Flip client order; both nodes must be preserved, just moved.
        items.value = [{ id: "b", n: 2 }, { id: "a", n: 1 }];
        const lis = Array.from(container.querySelectorAll("li"));
        expect(lis[0]).toBe(liB);
        expect(lis[1]).toBe(liA);
        handle.unmount();
    });

    it("does not leak effects/listeners after unmount", async () => {
        let clicks = 0;
        const items = signal([{ id: "a", n: 1 }]);
        const template = html`
            <ul>${() => repeat(items.value, (item) => item.id, (item) => html`<li><button @click=${() => clicks++}>${item.n}</button></li>`)}</ul>
        `;
        const container = await ssr(template);
        const handle = hydrate(template, container);
        const button = container.querySelector("button")!;
        button.click();
        expect(clicks).toBe(1);
        handle.unmount();
        button.click();
        expect(clicks).toBe(1);
    });
});