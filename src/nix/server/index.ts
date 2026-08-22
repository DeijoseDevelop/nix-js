import { AsyncLocalStorage } from "node:async_hooks";
import { _popComponentContext, _pushComponentContext, _setContextScopeResolver } from "../context.js";
import { isNixComponent, type NixComponent } from "../lifecycle.js";
import {
    isKeyedList,
    isNixTemplate,
    NIX_RENDER_PROTOCOL,
    NIX_TEMPLATE_DESCRIPTOR,
    type ServerRenderProtocolContext,
    type TemplateBindingContext,
    type TemplateDescriptor,
} from "../template/types.js";
import { sanitizeUrl } from "../template/sanitize.js";
import { normalizeRepeatKey, serializeRepeatKey } from "../template/keyed.js";

// Local guards avoid sharing the same minified import binding name with
// callback parameters in the same module (esbuild bug with shared chunks).
const isTemplate = isNixTemplate;
const isKeyed = isKeyedList;

export interface RenderErrorInfo {
    /** Binding index inside the descriptor (or -1 for root/component errors). */
    index: number;
    /** Binding context where the error occurred. */
    context: "node" | "attribute" | "event" | "root" | "component";
    /** The original error. */
    cause: unknown;
    /** Debug name of the component when the error happened inside one. */
    component?: string;
}

export interface ServerRenderOptions {
    markers?: "none" | "hydration";
    signal?: AbortSignal;
    context?: unknown;
    onError?: (error: unknown, info: RenderErrorInfo) => void;
}

/** A fragment of the rendered markup, streamed incrementally by `renderToChunks`. */
export interface RenderChunk {
    type: "markup" | "boundary-start" | "boundary-end" | "error" | "done"
    | "suspense-fallback" | "suspense-resolved";
    value: string;
    index: number;
    /** For suspense chunks: unique boundary ID used to pair fallback→resolved. */
    boundaryId?: string;
}

interface RenderState {
    markers: boolean;
    signal?: AbortSignal;
    context?: unknown;
    onError?: (error: unknown, info: RenderErrorInfo) => void;
}

const renderContext = new AsyncLocalStorage<Map<unknown, unknown>[]>();
_setContextScopeResolver(() => renderContext.getStore());

export interface ServerRenderScope {
    /** Abort signal that cancels all renders created through this scope. */
    readonly signal: AbortSignal;
    /** Renders a value to a full string, sharing this scope's context isolation. */
    render(value: unknown, options?: { markers?: boolean }): Promise<string>;
    /** Streams a value as incremental chunks, sharing this scope's context isolation. */
    renderToChunks(value: unknown, options?: { markers?: boolean }): AsyncIterable<RenderChunk>;
    /** Aborts every render running inside this scope. */
    abort(reason?: unknown): void;
}

/**
 * Creates an explicit server render scope: a per-render isolation unit that
 * keeps component context, markers and abort state private. Concurrent renders
 * created from the same scope never share `provide`/`inject` state.
 */
export function createServerRenderScope(options: Omit<ServerRenderOptions, "signal"> = {}): ServerRenderScope {
    const controller = new AbortController();
    const state: RenderState = {
        markers: options.markers === "hydration",
        context: options.context,
        onError: options.onError,
    };
    const run = <T>(fn: () => Promise<T> | T): Promise<T> => Promise.resolve(renderContext.run([], fn));
    return {
        signal: controller.signal,
        async render(value, opts): Promise<string> {
            const scoped: RenderState = { ...state, markers: opts?.markers ?? state.markers, signal: controller.signal };
            let out = "";
            await run(() => {
                return (async () => {
                    for await (const chunk of renderValueChunks(value, scoped)) {
                        out += chunk.value;
                    }
                })();
            });
            return out;
        },
        renderToChunks(value, opts): AsyncIterable<RenderChunk> {
            const scoped: RenderState = { ...state, markers: opts?.markers ?? state.markers, signal: controller.signal };
            return streamChunks(value, scoped);
        },
        abort(reason?: unknown): void {
            controller.abort(reason);
        },
    };
}

/**
 * Streams chunks produced inside an AsyncLocalStorage scope, preserving
 * per-render context isolation while yielding incrementally.
 */
function streamChunks(value: unknown, state: RenderState): AsyncIterable<RenderChunk> {
    return {
        async *[Symbol.asyncIterator]() {
            const queue: RenderChunk[] = [];
            const waiters: Array<() => void> = [];
            let producerDone = false;
            let producerError: unknown;
            const wake = () => {
                const waiter = waiters.shift();
                waiter?.();
            };

            const task = renderContext.run([], async () => {
                try {
                    for await (const chunk of renderValueChunks(value, state)) {
                        queue.push(chunk);
                        wake();
                    }
                } catch (error) {
                    producerError = error;
                } finally {
                    producerDone = true;
                    wake();
                }
            });

            while (true) {
                while (queue.length === 0) {
                    if (producerDone) break;
                    await new Promise<void>((resolve) => waiters.push(resolve));
                }
                if (queue.length === 0) break;
                const chunk = queue.shift()!;
                if (chunk) yield chunk;
            }
            if (producerError) throw producerError;
            yield { type: "done", value: "", index: -1 };
            await task;
        },
    };
}

export async function renderToString(value: unknown, options: ServerRenderOptions = {}): Promise<string> {
    const state: RenderState = {
        markers: options.markers === "hydration",
        signal: options.signal,
        context: options.context,
        onError: options.onError,
    };
    let out = "";
    await Promise.resolve(
        renderContext.run([], async () => {
            for await (const chunk of renderValueChunks(value, state)) {
                out += chunk.value;
            }
        }),
    );
    return out;
}

export function renderToChunks(
    value: unknown,
    options: ServerRenderOptions = {},
): AsyncIterable<RenderChunk> {
    const state: RenderState = {
        markers: options.markers === "hydration",
        signal: options.signal,
        context: options.context,
        onError: options.onError,
    };
    return streamChunks(value, state);
}

async function* renderValueChunks(value: unknown, state: RenderState): AsyncGenerator<RenderChunk> {
    checkAbort(state);
    if (value instanceof Promise) {
        yield* renderValueChunks(await value, state);
        return;
    }
    if (value === null || value === undefined || value === false || value === true) return;
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
        yield { type: "markup", value: escapeText(String(value)), index: -1 };
        return;
    }
    if (Array.isArray(value)) {
        const resolved = await Promise.all(value.map((item) => resolveBindingValue(item)));
        checkAbort(state);
        for (const item of resolved) {
            if (state.markers) yield { type: "markup", value: "<!--nix-ai-->", index: -1 };
            yield* renderValueChunks(item, state);
            if (state.markers) yield { type: "markup", value: "<!--nix-aiend-->", index: -1 };
        }
        return;
    }
    if ((typeof value === "object" || typeof value === "function") && value !== null) {
        const protocol = (value as Record<PropertyKey, unknown>)[NIX_RENDER_PROTOCOL] as
            | { renderServer?: (context: ServerRenderProtocolContext) => string | Promise<string> }
            | undefined;
        if (protocol?.renderServer) {
            const output = await protocol.renderServer({
                markers: state.markers,
                signal: state.signal,
                context: state.context,
                render: (nested, options) => renderValue(nested, {
                    ...state,
                    markers: options?.markers ?? state.markers,
                }),
            });
            checkAbort(state);
            yield { type: "markup", value: output, index: -1 };
            return;
        }
    }
    if (isNixComponent(value)) {
        yield* renderComponentChunks(value, state);
        return;
    }
    if (isKeyed(value)) {
        if (!state.markers) {
            const rendered = await Promise.all(
                value.items.map((item, index) => renderValue(value.renderFn(item, index), state)),
            );
            yield { type: "markup", value: rendered.join(""), index: -1 };
            return;
        }
        const seen = new Set<string>();
        for (let index = 0; index < value.items.length; index++) {
            const item = value.items[index];
            const key = normalizeRepeatKey(value.keyFn(item, index), index);
            const serialized = serializeRepeatKey(key);
            if (seen.has(serialized)) {
                console.warn(
                    `[nix-js] repeat(): duplicate key "${key}" during server render. ` +
                    "Keys must be unique; entries after the first will leak during hydration.",
                );
            }
            seen.add(serialized);
            yield { type: "markup", value: `<!--nix-ki:${serialized}-->`, index: -1 };
            yield* renderValueChunks(value.renderFn(item, index), state);
            yield { type: "markup", value: "<!--nix-ke-->", index: -1 };
        }
        return;
    }
    if (isTemplate(value)) {
        const descriptor = value[NIX_TEMPLATE_DESCRIPTOR];
        if (!descriptor) throw new TypeError("[nix-js] Template does not support server rendering");
        yield* renderDescriptorChunks(descriptor, state);
        return;
    }
    yield { type: "markup", value: escapeText(String(value)), index: -1 };
}

async function* renderComponentChunks(component: NixComponent, state: RenderState): AsyncGenerator<RenderChunk> {
    _pushComponentContext();
    const info: RenderErrorInfo = {
        index: -1,
        context: "component",
        cause: undefined,
        component: component._debugName,
    };
    try {
        try {
            component.onInit?.();
            component.onServerRender?.();
        } catch (error) {
            if (component.onError) component.onError(error);
            else throw error;
        }
        try {
            yield* renderValueChunks(component.render(), state);
        } catch (error) {
            if (component.onError) {
                component.onError(error);
                return;
            }
            throw error;
        }
    } catch (error) {
        state.onError?.(error, { ...info, cause: error });
        throw error;
    } finally {
        _popComponentContext();
    }
}

async function* renderDescriptorChunks(descriptor: TemplateDescriptor, state: RenderState): AsyncGenerator<RenderChunk> {
    const skipLeading = new Uint8Array(descriptor.strings.length);

    for (let index = 0; index < descriptor.strings.length; index++) {
        if (state.signal?.aborted) throw state.signal.reason ?? new DOMException("Render aborted", "AbortError");
        let staticPart = descriptor.strings[index];
        if (skipLeading[index] === 1 && (staticPart[0] === '"' || staticPart[0] === "'")) {
            staticPart = staticPart.slice(1);
        }
        if (index >= descriptor.contexts.length) {
            yield { type: "markup", value: staticPart, index };
            continue;
        }

        const context = descriptor.contexts[index];
        const value = descriptor.values[index];
        if (context.type === "node") {
            yield { type: "markup", value: staticPart, index };
            if (state.markers) yield { type: "boundary-start", value: `<!--nix-${index}-->`, index };
            try {
                const resolved = await resolveBindingValue(value);
                checkAbort(state);
                yield* renderValueChunks(resolved, state);
            } catch (error) {
                state.onError?.(error, { index, context: "node", cause: error });
                throw error;
            }
            if (state.markers) yield { type: "boundary-end", value: `<!--nix-end-${index}-->`, index };
            continue;
        }

        const cut = bindingCut(context);
        const prefix = staticPart.slice(0, -cut);
        if (context.hadOpenQuote) skipLeading[index + 1] = 1;
        if (context.type === "event") {
            if (state.markers) {
                const separator = /\s$/.test(prefix) ? "" : " ";
                yield { type: "markup", value: `${prefix}${separator}data-nix-e-${index}="${escapeAttribute(context.eventName)}"`, index };
            } else {
                yield { type: "markup", value: prefix.replace(/\s+$/, ""), index };
            }
            continue;
        }

        yield { type: "markup", value: prefix, index };
        const resolved = await resolveBindingValue(value);
        checkAbort(state);
        if (context.attrName !== "ref" && resolved !== null && resolved !== undefined && resolved !== false) {
            const serialized = context.url ? sanitizeUrl(String(resolved)) : String(resolved);
            const separator = /\s$/.test(prefix) ? "" : " ";
            yield { type: "markup", value: `${separator}${context.attrName}="${escapeAttribute(serialized)}"`, index };
        }
        if (state.markers) yield { type: "markup", value: ` data-nix-a-${index}="${escapeAttribute(context.attrName)}"`, index };
    }
}

async function renderValue(value: unknown, state: RenderState): Promise<string> {
    let out = "";
    for await (const chunk of renderValueChunks(value, state)) {
        out += chunk.value;
    }
    return out;
}

function checkAbort(state: RenderState): void {
    if (state.signal?.aborted) throw state.signal.reason ?? new DOMException("Render aborted", "AbortError");
}

async function resolveBindingValue(value: unknown): Promise<unknown> {
    const resolved = typeof value === "function" ? (value as () => unknown)() : value;
    return resolved instanceof Promise ? await resolved : resolved;
}

function bindingCut(context: Exclude<TemplateBindingContext, { type: "node" }>): number {
    if (context.type === "event") {
        const full = context.modifiers.length
            ? `${context.eventName}.${context.modifiers.join(".")}`
            : context.eventName;
        return `@${full}=`.length + (context.hadOpenQuote ? 1 : 0);
    }
    return `${context.attrName}=`.length + (context.hadOpenQuote ? 1 : 0);
}

function escapeText(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

function escapeAttribute(value: string): string {
    return escapeText(value).replace(/"/g, "&quot;");
}

// ─── Suspense Streaming (Fix #4 — v3.1) ─────────────────────────────────────

/**
 * Generates a unique boundary ID for suspense streaming.
 */
let _suspenseCounter = 0;

function nextSuspenseId(): string {
    return `nix-s${++_suspenseCounter}`;
}

/**
 * Creates a suspense boundary for SSR streaming. Emits the fallback HTML
 * immediately, then streams the resolved content as a replacement chunk.
 *
 * The browser replaces the fallback with the resolved content using
 * `<template>` markers and a microtask script.
 *
 * ```ts
 * const boundary = createSuspenseBoundary();
 * // Emit fallback:
 * stream.push({ type: "suspense-fallback", value: boundary.fallbackHtml(fallback), ... });
 * // Later, emit resolved:
 * stream.push({ type: "suspense-resolved", value: boundary.resolvedHtml(content), ... });
 * ```
 *
 * (v3.1 — Fix #4)
 */
export interface SuspenseBoundary {
    id: string;
    /** Wraps fallback HTML in a suspense boundary marker. */
    fallbackHtml(fallback: string): string;
    /** Wraps resolved HTML with a replacement script. */
    resolvedHtml(content: string): string;
}

export function createSuspenseBoundary(): SuspenseBoundary {
    const id = nextSuspenseId();
    return {
        id,
        fallbackHtml(fallback: string): string {
            return `<!--nix-suspense-${id}--><div id="${id}" style="display:contents">${fallback}</div><!--/nix-suspense-${id}-->`;
        },
        resolvedHtml(content: string): string {
            // The browser script replaces the fallback div with the resolved content.
            return `<template id="${id}-tpl">${content}</template>` +
                `<script>(function(){var t=document.getElementById("${id}-tpl");var f=document.getElementById("${id}");if(t&&f){f.replaceWith(t.content.cloneNode(true));}})();</script>`;
        },
    };
}

/**
 * Wraps a renderToChunks stream to process suspense boundaries.
 * When a `suspense-fallback` chunk is emitted, it's sent immediately.
 * When the corresponding `suspense-resolved` chunk arrives, it's sent
 * as a replacement.
 *
 * (v3.1 — Fix #4)
 */
export async function* streamWithSuspense(
    chunks: AsyncIterable<RenderChunk>,
): AsyncGenerator<RenderChunk> {
    for await (const chunk of chunks) {
        // Pass through all chunk types including the new suspense types.
        yield chunk;
    }
}