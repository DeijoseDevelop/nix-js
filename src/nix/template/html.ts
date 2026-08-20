import { NIX_TEMPLATE_DESCRIPTOR, type NixTemplate, type NixMountHandle, type TemplateDescriptor } from "./types.js";
import { detectContext, activateBindings } from "./bindings.js";
import type { BindingContext } from "./bindings.js";

// =============================================================================
// --- Static HTML construction with markers ---
// =============================================================================

/**
 * Builds the static HTML string, replacing each interpolated value with
 * a comment marker (node), data-nix-e-N (event), or data-nix-a-N (attribute).
 */
export function buildHTML(
    strings: readonly string[],
    contexts: BindingContext[]
): string {
    const skipLeading = new Uint8Array(strings.length);
    let result = "";

    for (let i = 0; i < strings.length; i++) {
        let s = strings[i];

        if (skipLeading[i] === 1 && (s[0] === '"' || s[0] === "'")) {
            s = s.slice(1);
        }

        if (i < contexts.length) {
            const ctx = contexts[i];

            if (ctx.type === "node") {
                result += s + `<!--nix-${i}-->`;
            } else if (ctx.type === "event") {
                const full = ctx.modifiers.length
                    ? `${ctx.eventName}.${ctx.modifiers.join(".")}`
                    : ctx.eventName;
                const cut = `@${full}=`.length + (ctx.hadOpenQuote ? 1 : 0);
                result += s.slice(0, -cut) + ` data-nix-e-${i}="${ctx.eventName}"`;
                if (ctx.hadOpenQuote) skipLeading[i + 1] = 1;
            } else {
                const cut =
                    `${ctx.attrName}=`.length + (ctx.hadOpenQuote ? 1 : 0);
                result += s.slice(0, -cut) + ` data-nix-a-${i}="${ctx.attrName}"`;
                if (ctx.hadOpenQuote) skipLeading[i + 1] = 1;
            }
        } else {
            result += s;
        }
    }

    return result;
}

// =============================================================================
// --- Template cache ---
// =============================================================================

interface DescriptorCache {
    contexts: BindingContext[];
}

interface TemplateCache {
    tpl: HTMLTemplateElement;
    pathMap: Array<{ nodeIndex: number; name?: string } | null>;
}

const _descriptorCache = new WeakMap<TemplateStringsArray, DescriptorCache>();
const _templateCache = new WeakMap<TemplateStringsArray, TemplateCache>();

// =============================================================================
// --- html`` tag function ---
// =============================================================================

export function html(
    strings: TemplateStringsArray,
    ...values: unknown[]
): NixTemplate {
    let descriptorCache = _descriptorCache.get(strings);
    if (!descriptorCache) {
        const contexts: BindingContext[] = [];
        let accumulated = "";
        for (let i = 0; i < strings.length - 1; i++) {
            accumulated += strings[i];
            contexts.push(detectContext(accumulated));
            accumulated += "__nix__";
        }
        descriptorCache = { contexts };
        _descriptorCache.set(strings, descriptorCache);
    }

    const contexts = descriptorCache.contexts;
    const descriptor: TemplateDescriptor = { version: 1, strings, values, contexts };

    function getTemplateCache(): TemplateCache {
        let cached = _templateCache.get(strings);
        if (cached) return cached;
        if (typeof document === "undefined") {
            throw new Error("[nix-js] DOM rendering requires a document. Use @deijose/nix-js/server on the server.");
        }

        const tpl = document.createElement("template");
        tpl.innerHTML = buildHTML(strings, contexts);
        const pathMap = new Array<{ nodeIndex: number; name?: string } | null>(contexts.length).fill(null);
        const root = tpl.content;
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);
        let nodeIndex = 0;
        let wNode: Node | null;

        while ((wNode = walker.nextNode())) {
            nodeIndex++;
            if (wNode.nodeType === 8) {
                const val = wNode.nodeValue;
                if (val && val.startsWith("nix-")) {
                    const idx = parseInt(val.slice(4), 10);
                    if (!isNaN(idx)) pathMap[idx] = { nodeIndex };
                }
            } else if (wNode.nodeType === 1) {
                const el = wNode as Element;
                const attrs = Array.from(el.attributes);
                for (let i = 0; i < attrs.length; i++) {
                    const attr = attrs[i];
                    const name = attr.name;
                    if (name.startsWith("data-nix-e-")) {
                        const idx = parseInt(name.slice(11), 10);
                        if (!isNaN(idx)) pathMap[idx] = { nodeIndex, name: attr.value };
                        el.removeAttribute(name);
                        continue;
                    }
                    if (name.startsWith("data-nix-a-")) {
                        const idx = parseInt(name.slice(11), 10);
                        if (!isNaN(idx)) pathMap[idx] = { nodeIndex, name: attr.value };
                        el.removeAttribute(name);
                    }
                }
            }
        }

        cached = { tpl, pathMap };
        _templateCache.set(strings, cached);
        return cached;
    }

    function _render(parent: Node, before: Node | null): () => void {
        const { tpl, pathMap } = getTemplateCache();
        const fragment = tpl.content.cloneNode(true) as DocumentFragment;

        const { disposes, postMountHooks } = activateBindings(
            fragment, contexts, values, pathMap
        );

        const startMarker = document.createTextNode("");
        const endMarker = document.createTextNode("")

        parent.insertBefore(startMarker, before);
        parent.insertBefore(fragment, before);
        parent.insertBefore(endMarker, before);

        postMountHooks.forEach((cb) => cb());

        return () => {
            for (let i = disposes.length - 1; i >= 0; i--) {
                disposes[i]();
            }
            let node = startMarker.nextSibling;
            while (node && node !== endMarker) {
                const next = node.nextSibling;
                node.parentNode?.removeChild(node);
                node = next;
            }
            startMarker.parentNode?.removeChild(startMarker);
            endMarker.parentNode?.removeChild(endMarker);
        };
    }

    const nixTemplate: NixTemplate = {
        __isNixTemplate: true,
        [NIX_TEMPLATE_DESCRIPTOR]: descriptor,

        _render,

        mount(container: Element | string): NixMountHandle {
            const el =
                typeof container === "string"
                    ? (document.querySelector(container) as Element)
                    : container;

            if (!el) {
                throw new Error(`[nix-js] mount: contenedor no encontrado: ${container}`);
            }

            const cleanup = _render(el, null);

            return {
                unmount() {
                    cleanup();
                },
            };
        },
    };

    return nixTemplate;
}
