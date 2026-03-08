import { describe, it, expect } from "vitest";
import { html } from "../nix/template";
import { NixComponent } from "../nix/lifecycle";
import { mount } from "../nix/component";
import {
    createInjectionKey,
    provide,
    inject,
    _pushComponentContext,
    _popComponentContext,
} from "../nix/context";

describe("context (provide / inject)", () => {
    it("createInjectionKey returns a unique symbol", () => {
        const k1 = createInjectionKey<number>("a");
        const k2 = createInjectionKey<number>("a");
        expect(typeof k1).toBe("symbol");
        expect(k1).not.toBe(k2);
    });

    it("provide + inject round-trip inside component context", () => {
        _pushComponentContext();
        const KEY = createInjectionKey<string>("test");
        provide(KEY, "hello");
        expect(inject(KEY)).toBe("hello");
        _popComponentContext();
    });

    it("inject returns undefined when key not provided", () => {
        _pushComponentContext();
        const KEY = createInjectionKey<number>("missing");
        expect(inject(KEY)).toBeUndefined();
        _popComponentContext();
    });

    it("child sees parent's provided value", () => {
        const KEY = createInjectionKey<string>("theme");

        let received: string | undefined;

        class Parent extends NixComponent {
            onInit() { provide(KEY, "dark"); }
            render() { return html`<div>${new Child()}</div>`; }
        }

        class Child extends NixComponent {
            onInit() { received = inject(KEY); }
            render() { return html`<span>child</span>`; }
        }

        const el = document.createElement("div");
        mount(new Parent(), el);
        expect(received).toBe("dark");
    });

    it("child can override parent provided value for its own children", () => {
        const KEY = createInjectionKey<number>("level");

        let receivedByGrandchild: number | undefined;

        class Grandchild extends NixComponent {
            onInit() { receivedByGrandchild = inject(KEY); }
            render() { return html`<span>gc</span>`; }
        }

        class Child extends NixComponent {
            onInit() { provide(KEY, 2); }
            render() { return html`<div>${new Grandchild()}</div>`; }
        }

        class Parent extends NixComponent {
            onInit() { provide(KEY, 1); }
            render() { return html`<div>${new Child()}</div>`; }
        }

        const el = document.createElement("div");
        mount(new Parent(), el);
        expect(receivedByGrandchild).toBe(2);
    });

    it("provide throws when called outside component context", () => {
        // Clear the stack by ensuring no context is active
        const KEY = createInjectionKey<string>("fail");
        expect(() => provide(KEY, "x")).toThrow();
    });
});
