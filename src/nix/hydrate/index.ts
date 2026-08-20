import { _captureContextSnapshot, _popComponentContext, _pushComponentContext } from "../context.js";
import { isNixComponent, type NixComponent } from "../lifecycle.js";
import { effect } from "../reactivity.js";
import { sanitizeUrl } from "../template/sanitize.js";
import {
    isKeyedList,
    isNixTemplate,
    NIX_RENDER_PROTOCOL,
    NIX_TEMPLATE_DESCRIPTOR,
    type KEntry,
    type NixMountHandle,
    type NixRef,
    type NixTemplate,
    type TemplateDescriptor,
} from "../template/types.js";
import {
    deserializeRepeatKey,
    normalizeRepeatKey,
    serializeRepeatKey,
    type RepeatKey,
} from "../template/keyed.js";
import { createKeyedMount, reconcileKeyedList } from "../template/keyed-diff.js";

export interface HydrateOptions {
    mismatch?: "throw" | "warn-remount" | "remount";
    onMismatch?: (error: HydrationMismatch) => void;
    context?: unknown;
}

export interface HydrationMismatch {
    index: number;
    kind: "node" | "attribute" | "event" | "descriptor" | "keyed";
    message: string;
}

interface MarkerRange {
    start: Comment;
    end: Comment;
}

interface KeyedMarkerRange {
    start: Comment;
    end: Comment;
    serializedKey: string;
}

interface ScannedMarkers {
    nodes: Map<number, MarkerRange>;
    attributes: Map<number, Element>;
    events: Map<number, Element>;
    keyed: Map<number, KeyedMarkerRange[]>;
    arrayItems: Map<number, MarkerRange[]>;
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
        if (options.mismatch !== "remount") console.warn("[nix-js] Hydration mismatch; remounting root:", error);
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
    let cleanup = () => { };
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
        const cleanup = activateNode(range!, value, options, markers.keyed.get(index), markers.arrayItems.get(index));
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
    const keyed = new Map<number, KeyedMarkerRange[]>();
    const arrayItems = new Map<number, MarkerRange[]>();
    const stack: number[] = [];
    const keyedStack: Array<{ start: Comment; serializedKey: string; parentIndex: number }> = [];
    const arrayStack: Array<{ start: Comment; parentIndex: number }> = [];
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
                continue;
            }
            const keyedStartMatch = /^nix-ki:(.+)$/.exec(comment.data);
            if (keyedStartMatch) {
                const serializedKey = keyedStartMatch[1];
                if (keyedStack.length === 0 && stack.length === 1) {
                    keyedStack.push({ start: comment, serializedKey, parentIndex: stack[stack.length - 1] });
                } else {
                    keyedStack.push({ start: comment, serializedKey, parentIndex: -1 });
                }
                continue;
            }
            if (comment.data === "nix-ke") {
                const active = keyedStack.pop();
                if (active) {
                    if (active.parentIndex >= 0) {
                        const list = keyed.get(active.parentIndex) ?? [];
                        list.push({ start: active.start, end: comment, serializedKey: active.serializedKey });
                        keyed.set(active.parentIndex, list);
                    }
                } else {
                    throw new Error("[nix-js] Hydration marker mismatch: orphan keyed end marker (nix-ke)");
                }
                continue;
            }
            if (comment.data === "nix-ai") {
                if (arrayStack.length === 0 && stack.length === 1) {
                    arrayStack.push({ start: comment, parentIndex: stack[stack.length - 1] });
                } else {
                    arrayStack.push({ start: comment, parentIndex: -1 });
                }
                continue;
            }
            if (comment.data === "nix-aiend") {
                const active = arrayStack.pop();
                if (active && active.parentIndex >= 0) {
                    const list = arrayItems.get(active.parentIndex) ?? [];
                    list.push({ start: active.start, end: comment });
                    arrayItems.set(active.parentIndex, list);
                }
                continue;
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

    return { nodes, attributes, events, keyed, arrayItems };
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
    let pendingSync = false;
    const update = (resolved: unknown) => {
        if (isProperty) {
            if (!firstRun) {
                (element as any)[name] = resolved ?? "";
            } else {
                // Interaction before hydration: the DOM may hold a value the
                // user (or a hydration race with lazy island directives like
                // "visible") wrote before the binding activated. The DOM is
                // authoritative; keep it and propagate it to reactive model
                // sources once every handler is attached (microtask) so a
                // late @input/@change listener picks up the real value.
                const current = (element as any)[name];
                const model = resolved ?? "";
                if (String(current) !== String(model) && !pendingSync) {
                    pendingSync = true;
                    const eventName = name === "checked" || name === "selected" ? "change" : "input";
                    queueMicrotask(() => {
                        pendingSync = false;
                        element.dispatchEvent(new Event(eventName, { bubbles: true }));
                    });
                }
            }
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
    return () => { };
}

function activateNode(
    range: MarkerRange,
    value: unknown,
    options: HydrateOptions,
    keyedItems?: KeyedMarkerRange[],
    arrayItems?: MarkerRange[],
): (() => void) | undefined {
    if (typeof value !== "function") return hydrateNodeValue(range, value, options, keyedItems, arrayItems);

    let firstRun = true;
    let nestedCleanup: (() => void) | undefined;
    let textNode = findTextNode(range);
    let keyed: { state: Map<RepeatKey, KEntry>; prevOrder: RepeatKey[] } | null = null;
    const ctxSnapshot = _captureContextSnapshot();
    const keyedMount = createKeyedMount(ctxSnapshot);

    const warnDuplicate = (key: RepeatKey) => {
        console.warn(`[nix-js] repeat(): duplicate key "${key}". Keys must be unique; the previous entry leaks (orphaned nodes + live effects).`);
    };

    const dispose = effect(() => {
        const resolved = (value as () => unknown)();

        if (isKeyedList(resolved)) {
            if (firstRun && !keyed) {
                // First resolution is a keyed list: adopt the SSR markers when
                // present. Afterwards we converge with the current model, which
                // handles count/ordering drift without recreating surviving nodes.
                const adopted = adoptKeyedRange(resolved, keyedItems, options);
                keyed = { state: adopted.state, prevOrder: adopted.prevOrder };
                nestedCleanup = adopted.cleanup;
                reconcileKeyedList({
                    zoneStart: range.start,
                    anchor: range.end,
                    state: keyed.state,
                    prevOrder: keyed.prevOrder,
                    list: resolved,
                    mount: keyedMount,
                    ctxSnapshot,
                    onDuplicateKey: warnDuplicate,
                });
                textNode = null;
                firstRun = false;
                return;
            }
            if (!keyed) {
                // The binding became keyed after another value: the SSR markers
                // were already consumed (or never existed), so mount fresh.
                nestedCleanup?.();
                clearRange(range);
                keyed = { state: new Map(), prevOrder: [] };
                nestedCleanup = () => {
                    for (const entry of keyed!.state.values()) entry.cleanup();
                };
            }
            reconcileKeyedList({
                zoneStart: range.start,
                anchor: range.end,
                state: keyed.state,
                prevOrder: keyed.prevOrder,
                list: resolved,
                mount: keyedMount,
                ctxSnapshot,
                onDuplicateKey: warnDuplicate,
            });
            textNode = null;
            firstRun = false;
            return;
        }

        // Non-keyed value: tear down any keyed zone first.
        if (keyed) {
            nestedCleanup?.();
            clearRange(range);
            keyed = null;
            nestedCleanup = undefined;
        }

        if (typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "bigint") {
            if (!textNode) {
                textNode = document.createTextNode(String(resolved));
                range.end.parentNode!.insertBefore(textNode, range.end);
            } else if (textNode.nodeValue !== String(resolved)) {
                textNode.nodeValue = String(resolved);
            }
        } else if (firstRun) {
            nestedCleanup = hydrateNodeValue(range, resolved, options, keyedItems, arrayItems);
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
    keyedItems?: KeyedMarkerRange[],
    arrayItems?: MarkerRange[],
): (() => void) | undefined {
    if (isKeyedList(value)) {
        const ctxSnapshot = _captureContextSnapshot();
        const adopted = adoptKeyedRange(value, keyedItems, options);
        reconcileKeyedList({
            zoneStart: range.start,
            anchor: range.end,
            state: adopted.state,
            prevOrder: adopted.prevOrder,
            list: value,
            mount: createKeyedMount(ctxSnapshot),
            ctxSnapshot,
            onDuplicateKey: (key) => {
                console.warn(`[nix-js] repeat(): duplicate key "${key}". Keys must be unique; the previous entry leaks (orphaned nodes + live effects).`);
            },
        });
        return adopted.cleanup;
    }
    if (Array.isArray(value)) {
        const cleanups: Array<() => void> = [];
        const hasMarkers = arrayItems !== undefined && arrayItems.length > 0;
        for (let index = 0; index < value.length; index++) {
            const item = value[index];
            const itemBounds = arrayItems?.[index];
            if (hasMarkers && itemBounds) {
                // Hydrate each item within its own SSR-delimited range so
                // repeated marker indices across items never collide.
                const cleanup = hydrateNodeValue(itemBounds, item, options);
                if (cleanup) cleanups.push(cleanup);
            } else if (hasMarkers) {
                // Client item with no SSR slot: mount it fresh at the end.
                const cleanup = mountNodeValue(range, item);
                if (cleanup) cleanups.push(cleanup);
            } else {
                const cleanup = hydrateNodeValue(range, item, options);
                if (cleanup) cleanups.push(cleanup);
            }
        }
        return cleanups.length ? () => { for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i](); } : undefined;
    }
    if (isNixTemplate(value)) {
        const descriptor = value[NIX_TEMPLATE_DESCRIPTOR];
        if (!descriptor) throwMismatch(options, -1, "descriptor", "Nested template has no hydration descriptor");
        return hydrateDescriptor(descriptor!, range.start.parentNode as ParentNode, options, range);
    }
    if (isNixComponent(value)) {
        _pushComponentContext();
        let result: (() => void) | undefined;
        try {
            try {
                value.onInit?.();
            } catch (error) {
                if (value.onError) value.onError(error);
                else throw error;
            }
            const template = value.render();
            const descriptor = template[NIX_TEMPLATE_DESCRIPTOR];
            if (!descriptor) throwMismatch(options, -1, "descriptor", "Nested component has no hydration descriptor");
            const cleanup = hydrateDescriptor(descriptor!, range.start.parentNode as ParentNode, options, range);
            const mountCleanup = value.onMount?.();
            result = () => {
                value.onUnmount?.();
                if (typeof mountCleanup === "function") mountCleanup();
                cleanup();
            };
        } finally {
            _popComponentContext();
        }
        return result;
    }
    if (value != null && typeof value === "object") {
        const protocol = (value as Record<PropertyKey, unknown>)[NIX_RENDER_PROTOCOL] as
            | { hydrateDom?: (ctx: import("../template/types.js").HydrationProtocolContext) => (() => void) | void }
            | undefined;
        if (protocol?.hydrateDom) {
            return protocol.hydrateDom({
                parent: range.start.parentNode!,
                bounds: range,
                context: options.context,
                render: (nested) => hydrateNodeValue(range, nested, options),
            }) ?? undefined;
        }
    }
    return undefined;
}

function adoptKeyedRange(
    list: import("../template/types.js").KeyedList,
    keyedItems: KeyedMarkerRange[] | undefined,
    options: HydrateOptions,
): { state: Map<RepeatKey, KEntry>; prevOrder: RepeatKey[]; cleanup: () => void } {
    const state = new Map<RepeatKey, KEntry>();
    const prevOrder: RepeatKey[] = [];

    if (!keyedItems || keyedItems.length === 0) {
        return { state, prevOrder, cleanup: () => { } };
    }

    const clientByKey = new Map<string, number>();
    for (let j = 0; j < list.items.length; j++) {
        const key = normalizeRepeatKey(list.keyFn(list.items[j], j), j);
        const serialized = serializeRepeatKey(key);
        if (clientByKey.has(serialized)) {
            console.warn(
                `[nix-js] repeat(): duplicate client key "${key}" during hydration. ` +
                    "Keys must be unique; entries after the first leak.",
            );
        }
        clientByKey.set(serialized, j);
    }

    for (const marker of keyedItems) {
        const clientIndex = clientByKey.get(marker.serializedKey);
        if (clientIndex === undefined) {
            // SSR item not present in the client model → remove its DOM.
            removeKeyedMarker(marker);
            continue;
        }
        const item = list.items[clientIndex];
        const key = normalizeRepeatKey(list.keyFn(item, clientIndex), clientIndex);
        if (serializeRepeatKey(key) !== marker.serializedKey) {
            console.warn(
                `[nix-js] repeat(): hydration key mismatch at index ${clientIndex} ` +
                    `(${deserializeRepeatKey(marker.serializedKey)} != ${key}). The SSR item is adopted by position.`,
            );
        }
        if (state.has(key)) {
            console.warn(`[nix-js] repeat(): duplicate key "${key}" during hydration; removing duplicate SSR node.`);
            removeKeyedMarker(marker);
            continue;
        }
        const rendered = list.renderFn(item, clientIndex);
        const cleanup = hydrateNodeValue(
            { start: marker.start, end: marker.end },
            rendered,
            options,
        );
        state.set(key, { start: marker.start, end: marker.end, cleanup: cleanup ?? (() => { }) });
        prevOrder.push(key);
    }

    return {
        state,
        prevOrder,
        cleanup: () => {
            for (const entry of state.values()) entry.cleanup();
        },
    };
}

function removeKeyedMarker(marker: KeyedMarkerRange): void {
    let node: Node | null = marker.start.nextSibling;
    while (node && node !== marker.end) {
        const next = node.nextSibling;
        node.parentNode?.removeChild(node);
        node = next;
    }
    marker.start.parentNode?.removeChild(marker.start);
    marker.end.parentNode?.removeChild(marker.end);
}

function mountNodeValue(range: MarkerRange, value: unknown): (() => void) | undefined {
    if (value === null || value === undefined || value === false || value === true) return undefined;
    if (Array.isArray(value)) {
        const cleanups: Array<() => void> = [];
        for (const item of value) {
            const cleanup = mountNodeValue(range, item);
            if (cleanup) cleanups.push(cleanup);
        }
        return cleanups.length ? () => { for (let i = cleanups.length - 1; i >= 0; i--) cleanups[i](); } : undefined;
    }
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
    const error = new Error(`[nix-js] Hydration marker mismatch: ${message}`);
    Object.assign(error, { mismatch });
    throw error;
}