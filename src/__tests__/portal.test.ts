import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { portal, portalOutlet, createPortalOutlet, provideOutlet, injectOutlet } from "../nix/template/portal";
import { html } from "../nix/template";

describe("createPortalOutlet()", () => {
    it("crea un outlet con __isPortalOutlet=true y _container=null", () => {
        const outlet = createPortalOutlet();
        expect(outlet.__isPortalOutlet).toBe(true);
        expect(outlet._container).toBeNull();
    });
});

describe("portalOutlet()", () => {
    it("monta un div con data-nix-outlet en el contenedor", () => {
        const outlet = createPortalOutlet();
        const container = document.createElement("div");
        portalOutlet(outlet).mount(container);

        const div = container.querySelector("[data-nix-outlet]");
        expect(div).not.toBeNull();
    });

    it("asigna _container al montar", () => {
        const outlet = createPortalOutlet();
        const container = document.createElement("div");
        portalOutlet(outlet).mount(container);

        expect(outlet._container).not.toBeNull();
    });

    it("limpia _container al desmontar", () => {
        const outlet = createPortalOutlet();
        const container = document.createElement("div");
        const handle = portalOutlet(outlet).mount(container);

        handle.unmount();

        expect(outlet._container).toBeNull();
        expect(container.querySelector("[data-nix-outlet]")).toBeNull();
    });

    it("_render inserta el div antes del nodo `before`", () => {
        const outlet = createPortalOutlet();
        const parent = document.createElement("div");
        const before = document.createTextNode("END");
        parent.appendChild(before);

        const tpl = portalOutlet(outlet);
        tpl._render(parent, before);

        const div = parent.querySelector("[data-nix-outlet]");
        expect(div).not.toBeNull();
        expect(div!.nextSibling).toBe(before);
    });
});

describe("portal()", () => {
    let body: HTMLElement;

    beforeEach(() => {
        body = document.body;
    });

    afterEach(() => {
        // limpiar body
        while (body.firstChild) body.removeChild(body.firstChild);
    });

    it("renderiza contenido en document.body por defecto", () => {
        const tpl = portal(html`<div class="modal">Modal</div>`);
        const el = document.createElement("div");
        tpl._render(el, null); // el padre real se ignora

        expect(document.body.querySelector(".modal")).not.toBeNull();
    });

    it("renderiza en un Element target específico", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);

        const tpl = portal(html`<div class="modal">M</div>`, target);
        const el = document.createElement("div");
        tpl._render(el, null);

        expect(target.querySelector(".modal")).not.toBeNull();
    });

    it("renderiza en un target por selector string", () => {
        const target = document.createElement("div");
        target.id = "portal-target";
        document.body.appendChild(target);

        const tpl = portal(html`<div class="modal">S</div>`, "#portal-target");
        const el = document.createElement("div");
        tpl._render(el, null);

        expect(target.querySelector(".modal")).not.toBeNull();
    });

    it("fallback a document.body si el selector no existe", () => {
        const tpl = portal(html`<div class="modal">X</div>`, "#no-existe");
        const el = document.createElement("div");
        tpl._render(el, null);

        expect(document.body.querySelector(".modal")).not.toBeNull();
    });

    it("renderiza en un PortalOutlet", () => {
        const outlet = createPortalOutlet();
        const outletContainer = document.createElement("div");
        portalOutlet(outlet).mount(outletContainer);

        const tpl = portal(html`<div class="modal">O</div>`, outlet);
        const el = document.createElement("div");
        tpl._render(el, null);

        expect(outletContainer.querySelector(".modal")).not.toBeNull();
    });

    it("renderiza en un NixRef", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);
        const ref = { el: target };

        const tpl = portal(html`<div class="modal">R</div>`, ref);
        const el = document.createElement("div");
        tpl._render(el, null);

        expect(target.querySelector(".modal")).not.toBeNull();
    });

    it("fallback a body si NixRef.el es null", () => {
        const ref = { el: null as Element | null };

        const tpl = portal(html`<div class="modal">N</div>`, ref);
        const el = document.createElement("div");
        tpl._render(el, null);

        expect(document.body.querySelector(".modal")).not.toBeNull();
    });

    it("limpia el contenido del portal al desmontar", () => {
        const target = document.createElement("div");
        document.body.appendChild(target);

        const tpl = portal(html`<div class="modal">M</div>`, target);
        const handle = tpl.mount(document.createElement("div"));

        expect(target.querySelector(".modal")).not.toBeNull();

        // El cleanup viene del _render interno en el target
        // mount() delega a _render
        handle.unmount();

        expect(target.querySelector(".modal")).toBeNull();
    });

    it("mount() con selector string funciona correctamente", () => {
        const container = document.createElement("div");
        container.id = "portal-mount-root";
        document.body.appendChild(container);

        const tpl = portal(html`<div class="modal">M</div>`);
        const handle = tpl.mount("#portal-mount-root");

        // El contenido se porta a body, no a container
        expect(document.body.querySelector(".modal")).not.toBeNull();

        handle.unmount();
    });
});

describe("provideOutlet / injectOutlet", () => {
    it("son funciones exportadas", () => {
        expect(typeof provideOutlet).toBe("function");
        expect(typeof injectOutlet).toBe("function");
    });

    it("injectOutlet retorna undefined fuera de un componente", () => {
        // Fuera de contexto de componente, inject retorna undefined
        const result = injectOutlet();
        expect(result).toBeUndefined();
    });
});
