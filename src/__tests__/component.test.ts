import { describe, it, expect, vi } from "vitest";
import { html } from "../nix/template";
import { NixComponent, isNixComponent } from "../nix/lifecycle";
import { mount } from "../nix/component";

// ── NixComponent ──────────────────────────────────────────────────────────────

describe("NixComponent", () => {
    it("has __isNixComponent marker", () => {
        class C extends NixComponent {
            render() { return html`<p>hi</p>`; }
        }
        expect(new C().__isNixComponent).toBe(true);
    });

    it("isNixComponent() returns true for instances", () => {
        class C extends NixComponent {
            render() { return html`<p>hi</p>`; }
        }
        expect(isNixComponent(new C())).toBe(true);
        expect(isNixComponent({})).toBe(false);
        expect(isNixComponent(null)).toBe(false);
    });

    it("render() output is mounted into the DOM", () => {
        class C extends NixComponent {
            render() { return html`<span class="comp">mounted</span>`; }
        }
        const el = document.createElement("div");
        mount(new C(), el);
        expect(el.querySelector(".comp")!.textContent).toBe("mounted");
    });
});

// ── Lifecycle hooks ───────────────────────────────────────────────────────────

describe("lifecycle hooks", () => {
    it("onInit is called before render", () => {
        const order: string[] = [];
        class C extends NixComponent {
            onInit() { order.push("init"); }
            render() { order.push("render"); return html`<p>x</p>`; }
        }
        const el = document.createElement("div");
        mount(new C(), el);
        expect(order).toEqual(["init", "render"]);
    });

    it("onMount is called after DOM insertion", () => {
        let mountedEl: HTMLElement | null = null;
        class C extends NixComponent {
            onMount() { mountedEl = document.querySelector(".lc") as HTMLElement; }
            render() { return html`<p class="lc">ok</p>`; }
        }
        const el = document.createElement("div");
        document.body.appendChild(el);
        mount(new C(), el);
        expect(mountedEl).not.toBeNull();
        document.body.removeChild(el);
    });

    it("onMount cleanup runs on unmount", () => {
        const cleanup = vi.fn();
        class C extends NixComponent {
            onMount() { return cleanup; }
            render() { return html`<p>x</p>`; }
        }
        const el = document.createElement("div");
        const handle = mount(new C(), el);
        expect(cleanup).not.toHaveBeenCalled();
        handle.unmount();
        expect(cleanup).toHaveBeenCalledOnce();
    });

    it("onUnmount is called on unmount", () => {
        const onUnmount = vi.fn();
        class C extends NixComponent {
            onUnmount() { onUnmount(); }
            render() { return html`<p>x</p>`; }
        }
        const el = document.createElement("div");
        const handle = mount(new C(), el);
        handle.unmount();
        expect(onUnmount).toHaveBeenCalledOnce();
    });

    it("onError catches errors from onInit", () => {
        const errors: unknown[] = [];
        class C extends NixComponent {
            onInit() { throw new Error("init-fail"); }
            onError(err: unknown) { errors.push(err); }
            render() { return html`<p>ok</p>`; }
        }
        const el = document.createElement("div");
        mount(new C(), el);
        expect(errors.length).toBe(1);
        expect((errors[0] as Error).message).toBe("init-fail");
    });
});

// ── Slots ─────────────────────────────────────────────────────────────────────

describe("slots", () => {
    it("setChildren / children works for default slot", () => {
        class Card extends NixComponent {
            render() { return html`<div class="card">${this.children}</div>`; }
        }
        const el = document.createElement("div");
        mount(
            new Card().setChildren(html`<p>child content</p>`),
            el
        );
        expect(el.querySelector(".card p")!.textContent).toBe("child content");
    });

    it("setSlot / slot works for named slots", () => {
        class Layout extends NixComponent {
            render() {
                return html`
          <header>${this.slot("header")}</header>
          <main>${this.children}</main>
        `;
            }
        }
        const el = document.createElement("div");
        mount(
            new Layout()
                .setSlot("header", html`<h1>Title</h1>`)
                .setChildren(html`<p>body</p>`),
            el
        );
        expect(el.querySelector("header h1")!.textContent).toBe("Title");
        expect(el.querySelector("main p")!.textContent).toBe("body");
    });
});

// ── mount() function ──────────────────────────────────────────────────────────

describe("mount()", () => {
    it("mounts NixTemplate directly", () => {
        const el = document.createElement("div");
        mount(html`<p>direct</p>`, el);
        expect(el.querySelector("p")!.textContent).toBe("direct");
    });

    it("mounts to a CSS selector string", () => {
        const el = document.createElement("div");
        el.id = "mount-test-comp";
        document.body.appendChild(el);
        mount(html`<p>sel</p>`, "#mount-test-comp");
        expect(el.querySelector("p")!.textContent).toBe("sel");
        document.body.removeChild(el);
    });

    it("throws for missing selector", () => {
        expect(() => mount(html`<p>x</p>`, "#nonexistent-4129")).toThrow();
    });
});

describe("mount() with NixComponent", () => {
    it("throws an error if the container selector is not found", () => {
        class DummyComp extends NixComponent {
            render() { return html`<div></div>`; }
        }

        expect(() => {
            mount(new DummyComp(), "#this-id-does-not-exist-12345");
        }).toThrow(/container not found/);
    });

    it("throws an error if onMount fails and there is no onError handler", () => {
        class ThrowingComp extends NixComponent {
            onMount() {
                throw new Error("mount crashed");
            }
            render() { return html`<div></div>`; }
        }

        const el = document.createElement("div");

        expect(() => {
            mount(new ThrowingComp(), el);
        }).toThrow("mount crashed");
    });

    it("delegates error to onError if onMount fails", () => {
        const errorSpy = vi.fn();

        class HandledThrowingComp extends NixComponent {
            onMount() {
                throw new Error("mount crashed handled");
            }
            onError(err: unknown) {
                errorSpy(err);
            }
            render() { return html`<div></div>`; }
        }

        const el = document.createElement("div");

        expect(() => {
            mount(new HandledThrowingComp(), el);
        }).not.toThrow(); // El error no debe escapar

        expect(errorSpy).toHaveBeenCalledOnce();
        expect(errorSpy.mock.calls[0][0].message).toBe("mount crashed handled");
    });
});
