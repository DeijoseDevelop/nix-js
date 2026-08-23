import { hydrate } from "/src/nix/hydrate/index.js";
import { keyedTemplate } from "/e2e/fixture/hydrate-page.ts";

declare global {
    interface Window {
        __keyed: {
            unmount(): void;
            mountClient(): void;
            count(): number;
            items(): string[];
        };
    }
}

const root = document.getElementById("root")!;
const handle = hydrate(keyedTemplate, root);

window.__keyed = {
    unmount() { handle.unmount(); },
    mountClient() {
        // Cliente puro del keyed template (sin SSR): monta en un contenedor
        // separado para verificar el plan compartido con el SSR.
        const zone = document.createElement("div");
        zone.id = "keyed-client";
        document.body.appendChild(zone);
        keyedTemplate.mount(zone);
    },
    count() {
        return document.querySelectorAll('[data-h="item"]').length;
    },
    items() {
        return Array.from(document.querySelectorAll('[data-h="item"]')).map(
            (el) => `${el.getAttribute("class")}`,
        );
    },
};