import { describe, it, expect, vi } from "vitest";
import {
    _mountComponent,
    _mountComponentSilent,
    _mountComponentDeferred,
    _mountComponentWithCtx,
} from "../nix/template/mount-helpers";
import { html } from "../nix/template";
import { _captureContextSnapshot } from "../nix/context";

// =============================================================================
// --- Helpers ---
// =============================================================================

function makeComp(overrides = {}) {
    return {
        __isNixComponent: true as const,
        render: () => html`<div class="comp">Comp</div>`,
        ...overrides,
    };
}

// =============================================================================
// --- _mountComponent ---
// =============================================================================

describe("_mountComponent()", () => {
    it("renderiza el componente en el parent", () => {
        const parent = document.createElement("div");
        const comp = makeComp();

        _mountComponent(comp as any, parent, null);

        expect(parent.querySelector(".comp")).not.toBeNull();
    });

    it("llama onInit antes de render", () => {
        const calls: string[] = [];
        const comp = makeComp({
            onInit: () => calls.push("init"),
            render: () => { calls.push("render"); return html`<div></div>`; },
        });

        const parent = document.createElement("div");
        _mountComponent(comp as any, parent, null);

        expect(calls.indexOf("init")).toBeLessThan(calls.indexOf("render"));
    });

    it("llama onMount después de render", () => {
        const calls: string[] = [];
        const comp = makeComp({
            render: () => { calls.push("render"); return html`<div></div>`; },
            onMount: () => calls.push("mount"),
        });

        const parent = document.createElement("div");
        _mountComponent(comp as any, parent, null);

        expect(calls.indexOf("render")).toBeLessThan(calls.indexOf("mount"));
    });

    it("la función de cleanup llama onUnmount", () => {
        const onUnmount = vi.fn();
        const parent = document.createElement("div");
        const comp = makeComp({ onUnmount });

        const cleanup = _mountComponent(comp as any, parent, null);
        cleanup();

        expect(onUnmount).toHaveBeenCalledOnce();
    });

    it("la función de cleanup llama el retorno de onMount", () => {
        const mountCleanup = vi.fn();
        const parent = document.createElement("div");
        const comp = makeComp({ onMount: () => mountCleanup });

        const cleanup = _mountComponent(comp as any, parent, null);
        cleanup();

        expect(mountCleanup).toHaveBeenCalledOnce();
    });

    it("la función de cleanup elimina el DOM del componente", () => {
        const parent = document.createElement("div");
        const comp = makeComp();

        const cleanup = _mountComponent(comp as any, parent, null);

        expect(parent.querySelector(".comp")).not.toBeNull();
        cleanup();
        expect(parent.querySelector(".comp")).toBeNull();
    });

    it("inserta antes del nodo `before`", () => {
        const parent = document.createElement("div");
        const before = document.createTextNode("END");
        parent.appendChild(before);

        // Supongo que makeComp() está definido más arriba en tu archivo
        const comp = makeComp();
        _mountComponent(comp as any, parent, before);

        const compEl = parent.querySelector(".comp")!;
        expect(compEl).not.toBeNull();

        // Comprobamos el orden relativo para ignorar markers intermedios
        const children = Array.from(parent.childNodes);
        expect(children.indexOf(compEl)).toBeLessThan(children.indexOf(before));
    });

    it("propaga error de onInit si no hay onError", () => {
        const parent = document.createElement("div");
        const comp = makeComp({
            onInit: () => { throw new Error("init fail"); },
        });

        expect(() => _mountComponent(comp as any, parent, null)).toThrow("init fail");
    });

    it("enruta error de onInit a onError si está presente", () => {
        const onError = vi.fn();
        const parent = document.createElement("div");
        const comp = makeComp({
            onInit: () => { throw new Error("init fail"); },
            onError,
        });

        expect(() => _mountComponent(comp as any, parent, null)).not.toThrow();
        expect(onError).toHaveBeenCalled();
    });
});

// =============================================================================
// --- _mountComponentSilent ---
// =============================================================================

describe("_mountComponentSilent()", () => {
    it("renderiza el componente normalmente", () => {
        const parent = document.createElement("div");
        const comp = makeComp();

        _mountComponentSilent(comp as any, parent, null);

        expect(parent.querySelector(".comp")).not.toBeNull();
    });

    it("NO propaga errores de onInit", () => {
        const parent = document.createElement("div");
        const comp = makeComp({
            onInit: () => { throw new Error("silent init fail"); },
        });

        expect(() => _mountComponentSilent(comp as any, parent, null)).not.toThrow();
    });

    it("NO propaga errores de onMount", () => {
        const parent = document.createElement("div");
        const comp = makeComp({
            onMount: () => { throw new Error("silent mount fail"); },
        });

        expect(() => _mountComponentSilent(comp as any, parent, null)).not.toThrow();
    });

    it("NO propaga errores de onUnmount al limpiar", () => {
        const parent = document.createElement("div");
        const comp = makeComp({
            onUnmount: () => { throw new Error("silent unmount fail"); },
        });

        const cleanup = _mountComponentSilent(comp as any, parent, null);
        expect(() => cleanup()).not.toThrow();
    });

    it("cleanup elimina el DOM", () => {
        const parent = document.createElement("div");
        const cleanup = _mountComponentSilent(makeComp() as any, parent, null);

        expect(parent.querySelector(".comp")).not.toBeNull();
        cleanup();
        expect(parent.querySelector(".comp")).toBeNull();
    });

    it("propaga error de onMount si no hay onError", () => {
        const parent = document.createElement("div");
        const comp = makeComp({ onMount: () => { throw new Error("mount fail"); } });
        expect(() => _mountComponent(comp as any, parent, null)).toThrow("mount fail");
    });

    it("enruta error de onMount a onError si está presente", () => {
        const onError = vi.fn();
        const parent = document.createElement("div");
        const comp = makeComp({ onMount: () => { throw new Error("mount fail"); }, onError });
        expect(() => _mountComponent(comp as any, parent, null)).not.toThrow();
        expect(onError).toHaveBeenCalled();
    });
});

// =============================================================================
// --- _mountComponentDeferred ---
// =============================================================================

describe("_mountComponentDeferred()", () => {
    it("renderiza el DOM inmediatamente", () => {
        const parent = document.createElement("div");
        const disposes: Array<() => void> = [];
        const postMountHooks: Array<() => void> = [];

        _mountComponentDeferred(makeComp() as any, parent, null, postMountHooks, disposes);

        expect(parent.querySelector(".comp")).not.toBeNull();
    });

    it("NO llama onMount inmediatamente", () => {
        const onMount = vi.fn();
        const parent = document.createElement("div");
        const disposes: Array<() => void> = [];
        const postMountHooks: Array<() => void> = [];

        _mountComponentDeferred(
            makeComp({ onMount }) as any,
            parent, null, postMountHooks, disposes
        );

        expect(onMount).not.toHaveBeenCalled();
    });

    it("onMount se llama al ejecutar postMountHooks", () => {
        const onMount = vi.fn();
        const parent = document.createElement("div");
        const disposes: Array<() => void> = [];
        const postMountHooks: Array<() => void> = [];

        _mountComponentDeferred(
            makeComp({ onMount }) as any,
            parent, null, postMountHooks, disposes
        );

        postMountHooks.forEach(h => h());

        expect(onMount).toHaveBeenCalledOnce();
    });

    it("pushea una función a disposes", () => {
        const parent = document.createElement("div");
        const disposes: Array<() => void> = [];
        const postMountHooks: Array<() => void> = [];

        _mountComponentDeferred(makeComp() as any, parent, null, postMountHooks, disposes);

        expect(disposes.length).toBe(1);
        expect(typeof disposes[0]).toBe("function");
    });

    it("dispose llama onUnmount", () => {
        const onUnmount = vi.fn();
        const parent = document.createElement("div");
        const disposes: Array<() => void> = [];
        const postMountHooks: Array<() => void> = [];

        _mountComponentDeferred(
            makeComp({ onUnmount }) as any,
            parent, null, postMountHooks, disposes
        );

        postMountHooks.forEach(h => h());
        disposes[0]();

        expect(onUnmount).toHaveBeenCalledOnce();
    });

    it("dispose también llama el retorno de onMount (mountCleanup)", () => {
        const mountCleanup = vi.fn();
        const parent = document.createElement("div");
        const disposes: Array<() => void> = [];
        const postMountHooks: Array<() => void> = [];

        _mountComponentDeferred(
            makeComp({ onMount: () => mountCleanup }) as any,
            parent, null, postMountHooks, disposes
        );

        postMountHooks.forEach(h => h());
        disposes[0]();

        expect(mountCleanup).toHaveBeenCalledOnce();
    });

    it("propaga error de onInit si no hay onError", () => {
        const parent = document.createElement("div");
        const comp = makeComp({ onInit: () => { throw new Error("init fail"); } });
        expect(() => _mountComponentDeferred(comp as any, parent, null, [], [])).toThrow("init fail");
    });

    it("enruta error de onInit a onError si está presente", () => {
        const onError = vi.fn();
        const parent = document.createElement("div");
        const comp = makeComp({ onInit: () => { throw new Error("init fail"); }, onError });
        expect(() => _mountComponentDeferred(comp as any, parent, null, [], [])).not.toThrow();
        expect(onError).toHaveBeenCalled();
    });

    it("propaga error de onMount al ejecutar hooks si no hay onError", () => {
        const parent = document.createElement("div");
        const hooks: Array<() => void> = [];
        const comp = makeComp({ onMount: () => { throw new Error("mount fail"); } });
        _mountComponentDeferred(comp as any, parent, null, hooks, []);
        expect(() => hooks[0]()).toThrow("mount fail");
    });

    it("enruta error de onMount a onError al ejecutar hooks si está presente", () => {
        const onError = vi.fn();
        const parent = document.createElement("div");
        const hooks: Array<() => void> = [];
        const comp = makeComp({ onMount: () => { throw new Error("mount fail"); }, onError });
        _mountComponentDeferred(comp as any, parent, null, hooks, []);
        expect(() => hooks[0]()).not.toThrow();
        expect(onError).toHaveBeenCalled();
    });
});

// =============================================================================
// --- _mountComponentWithCtx ---
// =============================================================================

describe("_mountComponentWithCtx()", () => {
    it("renderiza el componente en el parent", () => {
        const parent = document.createElement("div");
        const ctx = _captureContextSnapshot();

        _mountComponentWithCtx(makeComp() as any, parent, null, ctx);

        expect(parent.querySelector(".comp")).not.toBeNull();
    });

    it("llama onMount y retorna cleanup funcional", () => {
        const onUnmount = vi.fn();
        const parent = document.createElement("div");
        const ctx = _captureContextSnapshot();

        const cleanup = _mountComponentWithCtx(
            makeComp({ onUnmount }) as any,
            parent, null, ctx
        );

        cleanup();

        expect(onUnmount).toHaveBeenCalledOnce();
    });

    it("cleanup elimina el DOM", () => {
        const parent = document.createElement("div");
        const ctx = _captureContextSnapshot();

        const cleanup = _mountComponentWithCtx(makeComp() as any, parent, null, ctx);

        expect(parent.querySelector(".comp")).not.toBeNull();
        cleanup();
        expect(parent.querySelector(".comp")).toBeNull();
    });

    it("propaga error de onInit si no hay onError", () => {
        const parent = document.createElement("div");
        const ctx = _captureContextSnapshot();
        const comp = makeComp({ onInit: () => { throw new Error("init fail"); } });
        expect(() => _mountComponentWithCtx(comp as any, parent, null, ctx)).toThrow("init fail");
    });

    it("enruta error de onInit a onError si está presente", () => {
        const onError = vi.fn();
        const parent = document.createElement("div");
        const ctx = _captureContextSnapshot();
        const comp = makeComp({ onInit: () => { throw new Error("init fail"); }, onError });
        expect(() => _mountComponentWithCtx(comp as any, parent, null, ctx)).not.toThrow();
        expect(onError).toHaveBeenCalled();
    });

    it("propaga error de onMount si no hay onError", () => {
        const parent = document.createElement("div");
        const ctx = _captureContextSnapshot();
        const comp = makeComp({ onMount: () => { throw new Error("mount fail"); } });
        expect(() => _mountComponentWithCtx(comp as any, parent, null, ctx)).toThrow("mount fail");
    });

    it("enruta error de onMount a onError si está presente", () => {
        const onError = vi.fn();
        const parent = document.createElement("div");
        const ctx = _captureContextSnapshot();
        const comp = makeComp({ onMount: () => { throw new Error("mount fail"); }, onError });
        expect(() => _mountComponentWithCtx(comp as any, parent, null, ctx)).not.toThrow();
        expect(onError).toHaveBeenCalled();
    });
});
