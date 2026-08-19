import { _popComponentContext, _pushComponentContext } from "../context";
import { isNixComponent, type NixComponent } from "../lifecycle";
import { effect } from "../reactivity";
import { sanitizeUrl } from "../template/sanitize";
import {
    isNixTemplate,
    NIX_TEMPLATE_DESCRIPTOR,
    type NixMountHandle,
    type NixRef,
    type NixTemplate,
    type TemplateDescriptor,
} from "../template/types";

export interface HydrateOptions {
    mismatch?: "throw" | "warn-remount" | "remount";
    onMismatch?: (error: HydrationMismatch) => void;
}

export interface HydrationMismatch {
    index: number;
    kind: "node" | "attribute" | "event" | "descriptor";
    message: string;
}

interface MarkerRange {
    start: Comment;
    end: Comment;
}

interface ScannedMarkers {
    nodes: Map<number, MarkerRange>;
    attributes: Map<number, Element>;
    events: Map<number, Element>;
}

export function hydrate(
    value: NixTemplate | NixComponent,
    container: Element,
    options: HydrateOptions = {},
): NixMountHandle {
    try {
        if (isNixComponent(value)) return hydrateComponent(value, container, options);
        const descriptor = value[NIX_TEMPLATE_DESCRIPTOR];
        if (!descriptor) throwMismatch(options, -1, "descriptor", "Template has no hydration descriptor");
        const cleanup = hydrateDescriptor(descriptor!, container, options);
        return { unmount: cleanup };
    } catch (error) {
        if (options.mismatch === "throw") throw error;
        if (options.mismatch !== "remount") console.warn("[Nix] Hydration mismatch; remounting root:", error);
        container.replaceChildren();
        const cleanup = isNixComponent(value)
            ? value.render()._render(container, null)
            : value._render(container, null);
        return { unmount: cleanup };
    }
}

function hydrateComponent(
    component: NixComponent,
    container: Element,
    options: HydrateOptions,
): NixMountHandle {
    _pushComponentContext();
    let cleanup = () => {};
    try {
        try {
            component.onInit?.();
        } catch (error) {
            if (component.onError) component.onError(error);
            else throw error;
        }
        const template = component.render();
        const descriptor = template[NIX_TEMPLATE_DESCRIPTOR];
        if (!descriptor) throwMismatch(options, -1, "descriptor", "Component template has no hydration descriptor");
        cleanup = hydrateDescriptor(descriptor!, container, options);
    } finally {
        _popComponentContext();
    }
    const mountCleanup = component.onMount?.();
    return {
        unmount() {
            component.onUnmount?.();
            if (typeof mountCleanup === "function") mountCleanup();
            cleanup();
        },
    };
}

function hydrateDescriptor(
    descriptor: TemplateDescriptor,
    root: ParentNode,
    options: HydrateOptions,
    bounds?: MarkerRange,
): () => void {
    const markers = scanMarkers(root, bounds);
    const cleanups: Array<() => void> = [];

    for (let index = 0; index < descriptor.contexts.length; index++) {
        const context = descriptor.contexts[index];
        const value = descriptor.values[index];
        if (context.type === "event") {
            const element = markers.events.get(index);
            if (!element) throwMismatch(options, index, "event", `Missing event marker ${index}`);
            element!.removeAttribute(`data-nix-e-${index}`);
            cleanups.push(activateEvent(element!, context.eventName, context.modifiers, value));
            continue;
        }
        if (context.type === "attr") {
            const element = markers.attributes.get(index);
            if (!element) throwMismatch(options, index, "attribute", `Missing attribute marker ${index}`);
            element!.removeAttribute(`data-nix-a-${index}`);
            cleanups.push(activateAttribute(element!, context.attrName, context.url === true, value));
            continue;
        }

        const range = markers.nodes.get(index);
        if (!range) throwMismatch(options, index, "node", `Missing node marker ${index}`);
        const cleanup = activateNode(range!, value, options);
        if (cleanup) cleanups.push(cleanup);
    }

    return () => {
        for (let index = cleanups.length - 1; index >= 0; index--) cleanups[index]();
    };
}

function scanMarkers(root: ParentNode, bounds?: MarkerRange): ScannedMarkers {
    const nodes = new Map<number, MarkerRange>();
    const starts = new Map<number, Comment>();
    const attributes = new Map<number, Element>();
    const events = new Map<number, Element>();
    const stack: number[] = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_COMMENT);
    let current: Node | null;

    while ((current = walker.nextNode())) {
        if (bounds && !isInsideRange(current, bounds)) continue;
        if (current.nodeType === Node.COMMENT_NODE) {
            const comment = current as Comment;
            const startMatch = /^nix-(\d+)$/.exec(comment.data);
            if (startMatch) {
                const index = Number(startMatch[1]);
                if (stack.length === 0) starts.set(index, comment);
                stack.push(index);
                continue;
            }
            const endMatch = /^nix-end-(\d+)$/.exec(comment.data);
            if (endMatch) {
                const index = Number(endMatch[1]);
                const active = stack.pop();
                if (active === index && stack.length === 0) {
                    const start = starts.get(index);
                    if (start) nodes.set(index, { start, end: comment });
                }
            }
            continue;
        }
        if (stack.length > 0) continue;
        const element = current as Element;
        for (const attribute of Array.from(element.attributes)) {
            const eventMatch = /^data-nix-e-(\d+)$/.exec(attribute.name);
            if (eventMatch) events.set(Number(eventMatch[1]), element);
            const attributeMatch = /^data-nix-a-(\d+)$/.exec(attribute.name);
            if (attributeMatch) attributes.set(Number(attributeMatch[1]), element);
        }
    }

    return { nodes, attributes, events };
}

function isInsideRange(node: Node, range: MarkerRange): boolean {
    const domRange = document.createRange();
    domRange.setStartAfter(range.start);
    domRange.setEndBefore(range.end);
    return domRange.intersectsNode(node);
}

function activateEvent(
    element: Element,
    eventName: string,
    modifiers: readonly string[],
    value: unknown,
): () => void {
    if (typeof value !== "function") throw new TypeError(`Event "${eventName}" requires a function`);
    const options: AddEventListenerOptions = {
        once: modifiers.includes("once"),
        capture: modifiers.includes("capture"),
        passive: modifiers.includes("passive"),
    };
    const listener = (event: Event) => {
        if (modifiers.includes("prevent")) event.preventDefault();
        if (modifiers.includes("stop")) event.stopPropagation();
        if (modifiers.includes("self") && event.target !== event.currentTarget) return;
        (value as EventListener)(event);
    };
    element.addEventListener(eventName, listener, options);
    return () => element.removeEventListener(eventName, listener, options);
}

function activateAttribute(
    element: Element,
    name: string,
    url: boolean,
    value: unknown,
): () => void {
    if (name === "ref") {
        const reference = value as NixRef<Element>;
        reference.el = element;
        return () => { reference.el = null; };
    }

    const isProperty = (name === "value" || name === "checked" || name === "selected") && name in element;
    let firstRun = true;
    const update = (resolved: unknown) => {
        if (isProperty) {
            if (!firstRun) (element as any)[name] = resolved ?? "";
        } else if (resolved === null || resolved === undefined || resolved === false) {
            element.removeAttribute(name);
        } else {
            const serialized = url ? sanitizeUrl(String(resolved)) : String(resolved);
            element.setAttribute(name, serialized);
        }
        firstRun = false;
    };

    if (typeof value === "function") {
        return effect(() => update((value as () => unknown)()));
    }
    update(value);
    return () => {};
}

function activateNode(
    range: MarkerRange,
    value: unknown,
    options: HydrateOptions,
): (() => void) | undefined {
    if (typeof value !== "function") return hydrateNodeValue(range, value, options);
    let firstRun = true;
    let nestedCleanup: (() => void) | undefined;
    let textNode = findTextNode(range);
    const dispose = effect(() => {
        const resolved = (value as () => unknown)();
        if (typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "bigint") {
            if (!textNode) {
                textNode = document.createTextNode(String(resolved));
                range.end.parentNode!.insertBefore(textNode, range.end);
            } else if (textNode.nodeValue !== String(resolved)) {
                textNode.nodeValue = String(resolved);
            }
        } else if (firstRun) {
            nestedCleanup = hydrateNodeValue(range, resolved, options);
        } else {
            nestedCleanup?.();
            clearRange(range);
            nestedCleanup = mountNodeValue(range, resolved);
            textNode = findTextNode(range);
        }
        firstRun = false;
    });
    return () => {
        dispose();
        nestedCleanup?.();
    };
}

function hydrateNodeValue(
    range: MarkerRange,
    value: unknown,
    options: HydrateOptions,
): (() => void) | undefined {
    if (isNixTemplate(value)) {
        const descriptor = value[NIX_TEMPLATE_DESCRIPTOR];
        if (!descriptor) throwMismatch(options, -1, "descriptor", "Nested template has no hydration descriptor");
        return hydrateDescriptor(descriptor!, range.start.parentNode as ParentNode, options, range);
    }
    if (isNixComponent(value)) {
        value.onInit?.();
        const template = value.render();
        const descriptor = template[NIX_TEMPLATE_DESCRIPTOR];
        if (!descriptor) throwMismatch(options, -1, "descriptor", "Nested component has no hydration descriptor");
        const cleanup = hydrateDescriptor(descriptor!, range.start.parentNode as ParentNode, options, range);
        const mountCleanup = value.onMount?.();
        return () => {
            value.onUnmount?.();
            if (typeof mountCleanup === "function") mountCleanup();
            cleanup();
        };
    }
    return undefined;
}

function mountNodeValue(range: MarkerRange, value: unknown): (() => void) | undefined {
    if (value === null || value === undefined || value === false || value === true) return undefined;
    if (isNixTemplate(value)) return value._render(range.end.parentNode!, range.end);
    if (isNixComponent(value)) return value.render()._render(range.end.parentNode!, range.end);
    const node = document.createTextNode(String(value));
    range.end.parentNode!.insertBefore(node, range.end);
    return () => node.parentNode?.removeChild(node);
}

function findTextNode(range: MarkerRange): Text | null {
    let node = range.start.nextSibling;
    while (node && node !== range.end) {
        if (node.nodeType === Node.TEXT_NODE) return node as Text;
        node = node.nextSibling;
    }
    return null;
}

function clearRange(range: MarkerRange): void {
    let node = range.start.nextSibling;
    while (node && node !== range.end) {
        const next = node.nextSibling;
        node.parentNode?.removeChild(node);
        node = next;
    }
}

function throwMismatch(
    options: HydrateOptions,
    index: number,
    kind: HydrationMismatch["kind"],
    message: string,
): never {
    const mismatch = { index, kind, message } satisfies HydrationMismatch;
    options.onMismatch?.(mismatch);
    const error = new Error(`[Nix] Hydration marker mismatch: ${message}`);
    Object.assign(error, { mismatch });
    throw error;
}
