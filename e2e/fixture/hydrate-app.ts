import { hydrate } from "/src/nix/hydrate/index.js";
import { hColor, hSize, template } from "/e2e/fixture/hydrate-page.ts";

declare global {
    interface Window {
        __hyd: {
            setSize(v: string): void;
            setColor(v: string): void;
            get(sel: string, prop: string): unknown;
            unmount(): void;
        };
    }
}

const root = document.getElementById("root")!;
const handle = hydrate(template, root);

window.__hyd = {
    setSize(v) { hSize.value = v; },
    setColor(v) { hColor.value = v; },
    get(sel, prop) {
        const el = document.querySelector(sel) as unknown as Record<string, unknown>;
        return el ? el[prop] : undefined;
    },
    unmount() { handle.unmount(); },
};