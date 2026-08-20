import { effect } from "../reactivity.js";
import type { NixRef, TemplateBindingContext } from "./types.js";
import { activateNodeBinding } from "./node-binding.js";
import { queueDOMWrite } from "./dom-write.js";
import { isUrlAttrName, isExecutableAttrName, sanitizeUrl } from "./sanitize.js";

// =============================================================================
// --- show / hide ---
// =============================================================================

/** Toggles element visibility via `display: none` without unmounting. */
export function showWhen(el: HTMLElement, condition: boolean): void {
    if (!condition) {
        if (el.style.display !== "none") el.style.display = "none";
    } else {
        if (el.style.display === "none") el.style.display = "";
    }
}

// =============================================================================
// --- Binding context ---
// =============================================================================

export type BindingContext = TemplateBindingContext;

/**
 * Determines the binding context (node, event, or attribute) for an interpolated
 * value based on the preceding template string.
 */
export function detectContext(prevString: string): BindingContext {
    const lastClose = prevString.lastIndexOf(">");
    const lastOpen = prevString.lastIndexOf("<");

    if (lastOpen <= lastClose) {
        return { type: "node" };
    }

    const tagContent = prevString.slice(lastOpen + 1);

    const eqIdx = tagContent.lastIndexOf("=");
    if (eqIdx === -1) {
        return { type: "node" };
    }

    const hadOpenQuote =
        tagContent.endsWith('"') ||
        tagContent.endsWith("'") ||
        tagContent[tagContent.length - 1] === '"' ||
        tagContent[tagContent.length - 1] === "'";

    let startIdx = eqIdx - 1;
    while (startIdx >= 0 && /\S/.test(tagContent[startIdx])) {
        startIdx--;
    }
    startIdx++;

    const fullAttr = tagContent.slice(startIdx, eqIdx);

    if (fullAttr[0] === "@") {
        const parts = fullAttr.slice(1).split(".");
        return {
            type: "event",
            eventName: parts[0],
            modifiers: parts.slice(1),
            hadOpenQuote,
        };
    }

    return {
        type: "attr",
        attrName: fullAttr,
        hadOpenQuote,
        // Precomputed once per template (compile time). Read as a cheap boolean
        // in the render/update hot path.
        url: isUrlAttrName(fullAttr),
        executable: isExecutableAttrName(fullAttr),
    };
}

// =============================================================================
// --- Keyboard modifier map ---
// =============================================================================

const KEY_MAP: Readonly<Record<string, string>> = {
    enter: "Enter",
    escape: "Escape",
    space: " ",
    tab: "Tab",
    delete: "Delete",
    backspace: "Backspace",
    up: "ArrowUp",
    down: "ArrowDown",
    left: "ArrowLeft",
    right: "ArrowRight",
};

// =============================================================================
// --- Global Event Delegation ---
// =============================================================================

const DELEGABLE_EVENTS = new Set([
    "click", "dblclick", "mousedown", "mouseup",
    "keydown", "keyup", "input", "change", "submit"
]);
const _delegatedRegistry = new Set<string>();

function _globalEventHandlerCore(e: Event, propName: string, modsName: string): void {
    let target = e.target as Node | null;

    const originalStop = e.stopPropagation;
    let stopped = false;
    e.stopPropagation = () => {
        stopped = true;
        originalStop.call(e);
    };

    while (target && target !== document) {
        const handler = (target as any)[propName] as EventListener | undefined;
        if (handler) {
            const mods = (target as any)[modsName] as string[] | undefined;
            if (mods) {
                if (mods.includes("prevent")) e.preventDefault();
                if (mods.includes("stop")) e.stopPropagation();
                if (mods.includes("self") && e.target !== target) {
                    target = target.parentNode;
                    continue;
                }
                if ("key" in e) {
                    const ke = e as KeyboardEvent;
                    let keyMatch = true;
                    for (const mod of mods) {
                        const mapped = KEY_MAP[mod];
                        if (mapped !== undefined && ke.key !== mapped) { keyMatch = false; break; }
                        if (!mapped && mod.length === 1 && ke.key.toLowerCase() !== mod) { keyMatch = false; break; }
                    }
                    if (!keyMatch) {
                        target = target.parentNode;
                        continue;
                    }
                }
            }
            handler(e);
            if (stopped) break;
        }
        target = target.parentNode;
    }

    e.stopPropagation = originalStop;
}

// NOTE: entries are intentionally permanent — delegated listeners on document
// live for the application lifetime.
const _delegatedHandlers = new Map<string, (e: Event) => void>();

// =============================================================================
// --- Binding activation ---
// =============================================================================

/** Activates all bindings on the cloned fragment. Returns dispose/postMount. */
export function activateBindings(
    fragment: DocumentFragment,
    contexts: BindingContext[],
    values: unknown[],
    pathMap: Array<{ nodeIndex: number; name?: string } | null>,
): { disposes: Array<() => void>; postMountHooks: Array<() => void> } {
    const disposes: Array<() => void> = [];
    const postMountHooks: Array<() => void> = [];

    // PHASE 1: READ — single-pass TreeWalker O(N)
    const resolvedNodes = new Array<Node | null>(contexts.length);

    let maxNodeIndex = -1;
    for (let i = 0; i < contexts.length; i++) {
        if (pathMap[i] && pathMap[i]!.nodeIndex > maxNodeIndex) {
            maxNodeIndex = pathMap[i]!.nodeIndex;
        }
    }

    const flatNodes = new Array<Node>(maxNodeIndex + 1);
    flatNodes[0] = fragment;
    if (maxNodeIndex > 0) {
        const walker = document.createTreeWalker(fragment, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);
        let fi = 1;
        let currentNode: Node | null;
        while (fi <= maxNodeIndex && (currentNode = walker.nextNode())) {
            flatNodes[fi++] = currentNode;
        }
    }

    for (let i = 0; i < contexts.length; i++) {
        const info = pathMap[i];
        resolvedNodes[i] = info ? flatNodes[info.nodeIndex] : null;
    }

    // PHASE 2: MUTATE
    for (let i = 0; i < contexts.length; i++) {
        const ctx = contexts[i];
        const value = values[i];
        const info = pathMap[i];
        if (!info) continue;

        const el = resolvedNodes[i]!;

        // --- Events ---
        if (ctx.type === "event") {
            const eventName = info.name!;
            const rawHandler = value as EventListener;
            const mods = ctx.modifiers;

            const canDelegate =
                DELEGABLE_EVENTS.has(eventName) &&
                !mods.includes("capture") &&
                !mods.includes("once");

            if (canDelegate) {
                if (!_delegatedRegistry.has(eventName)) {
                    const propName = `__nix_${eventName}`;
                    const modsName = `__nix_${eventName}_mods`;
                    const boundHandler = (e: Event) => _globalEventHandlerCore(e, propName, modsName);
                    _delegatedHandlers.set(eventName, boundHandler);
                    document.addEventListener(eventName, boundHandler);
                    _delegatedRegistry.add(eventName);
                }

                const nodePropName = `__nix_${eventName}`;
                const nodeModsName = `__nix_${eventName}_mods`;
                (el as any)[nodePropName] = rawHandler;
                if (mods.length > 0) {
                    (el as any)[nodeModsName] = mods;
                }

                disposes.push(() => {
                    (el as any)[nodePropName] = null;
                    (el as any)[nodeModsName] = null;
                });
            } else {
                const listenerOpts: AddEventListenerOptions = {
                    once: mods.includes("once"),
                    capture: mods.includes("capture"),
                    passive: mods.includes("passive")
                };
                const handler = (e: Event) => {
                    if (mods.includes("prevent")) e.preventDefault();
                    if (mods.includes("stop")) e.stopPropagation();
                    if (mods.includes("self") && e.target !== e.currentTarget) return;
                    rawHandler(e);
                };
                el.addEventListener(eventName, handler, listenerOpts);
                disposes.push(() => el.removeEventListener(eventName, handler, listenerOpts));
            }
            continue;
        }

        // --- Attributes ---
        if (ctx.type === "attr") {
            const attrName = info.name!;
            const element = el as Element;

            if (attrName === "ref") {
                (value as NixRef<Element>).el = element;
                disposes.push(() => { (value as NixRef<Element>).el = null; });
                continue;
            }

            if (attrName === "show" || attrName === "hide") {
                const htmlEl = element as HTMLElement;
                let originalDisplay: string | null = null;

                if (typeof value === "function") {
                    let queued = false;
                    let pendingVisible = false;
                    let isFirstRun = true;

                    const dispose = effect(() => {
                        pendingVisible = Boolean((value as () => unknown)());
                        const update = () => {
                            queued = false;
                            const shouldShow = attrName === "show" ? pendingVisible : !pendingVisible;
                            if (originalDisplay === null) {
                                originalDisplay = htmlEl.style.display || "";
                            }
                            htmlEl.style.display = shouldShow ? originalDisplay : "none";
                        };

                        if (isFirstRun) {
                            isFirstRun = false;
                            update();
                        } else if (!queued) {
                            queued = true;
                            queueDOMWrite(update);
                        }
                    });
                    disposes.push(dispose);
                } else {
                    const shouldShow = attrName === "show" ? Boolean(value) : !Boolean(value);
                    if (!shouldShow) htmlEl.style.display = "none";
                }
                continue;
            }

            // on*/srcdoc bindings are non-idiomatic in Nix (events use @click) and
            // turn an untrusted value into executable code. Warn the developer but
            // do not block — the attribute name is developer-authored.
            if (ctx.executable ?? isExecutableAttrName(attrName)) {
                console.warn(
                    `[nix-js] Dynamic binding on executable attribute "${attrName}". Use @event for handlers; avoid binding untrusted values here.`,
                );
            }

            // Precomputed at compile time. Only URL attributes pay the sanitizer;
            // class/style/aria-*/data-*/custom attributes skip it entirely.
            const isUrl = ctx.url ?? isUrlAttrName(attrName);

            const isDomProp = (attrName === "value" || attrName === "checked" || attrName === "selected") && attrName in element;

            if (typeof value === "function") {
                let queued = false;
                let pendingValue: unknown;
                let isFirstRun = true;

                const dispose = effect(() => {
                    pendingValue = (value as () => unknown)();
                    const update = () => {
                        queued = false;
                        const v = pendingValue;
                        if (isDomProp) {
                            (element as any)[attrName] = v ?? "";
                        } else if (v == null || v === false) {
                            element.removeAttribute(attrName);
                        } else {
                            const s = String(v);
                            element.setAttribute(attrName, isUrl ? sanitizeUrl(s) : s);
                        }
                    };

                    if (isFirstRun) {
                        isFirstRun = false;
                        update();
                    } else if (!queued) {
                        queued = true;
                        queueDOMWrite(update);
                    }
                });
                disposes.push(dispose);
            } else {
                if (isDomProp) {
                    (element as any)[attrName] = value ?? "";
                } else if (value != null && value !== false) {
                    const s = String(value);
                    element.setAttribute(attrName, isUrl ? sanitizeUrl(s) : s);
                }
            }
            continue;
        }

        // --- Nodes — delegate to node-binding.ts ---
        const originalAnchor = el as Comment;
        if (!originalAnchor) continue;

        const anchor = document.createTextNode("");
        originalAnchor.parentNode!.replaceChild(anchor, originalAnchor);

        activateNodeBinding(anchor, value, disposes, postMountHooks);
    }

    return { disposes, postMountHooks };
}
