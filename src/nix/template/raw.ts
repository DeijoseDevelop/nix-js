import { NIX_RENDER_PROTOCOL, type NixRenderProtocol } from "./types.js";

/**
 * Marks a string as trusted raw HTML. Only use with sanitized/trusted content;
 * the markup is emitted verbatim on the server and mounted verbatim on the client
 * without escaping. This is the only explicit trusted path for raw HTML.
 */
export function raw(htmlString: string): { [NIX_RENDER_PROTOCOL]: NixRenderProtocol } {
    return {
        [NIX_RENDER_PROTOCOL]: {
            renderServer() {
                return htmlString;
            },
            mountDom({ parent, before }) {
                const template = document.createElement("template");
                template.innerHTML = htmlString;
                const start = document.createTextNode("");
                const end = document.createTextNode("");
                parent.insertBefore(start, before);
                parent.insertBefore(template.content, before);
                parent.insertBefore(end, before);
                return () => {
                    let node: Node | null = start.nextSibling;
                    while (node && node !== end) {
                        const next = node.nextSibling;
                        node.parentNode?.removeChild(node);
                        node = next;
                    }
                    start.parentNode?.removeChild(start);
                    end.parentNode?.removeChild(end);
                };
            },
            hydrateDom() {
                // The SSR markup is already present in the DOM; nothing to adopt.
                return () => { };
            },
        },
    };
}