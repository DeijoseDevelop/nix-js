import { AsyncLocalStorage } from "node:async_hooks";
import { _popComponentContext, _pushComponentContext, _setContextScopeResolver } from "../context";
import { isNixComponent, type NixComponent } from "../lifecycle";
import {
    isKeyedList,
    isNixTemplate,
    NIX_RENDER_PROTOCOL,
    NIX_TEMPLATE_DESCRIPTOR,
    type NixTemplate,
    type TemplateBindingContext,
    type TemplateDescriptor,
} from "../template/types";
import { sanitizeUrl } from "../template/sanitize";

// Local guards avoid sharing the same minified import binding name with
// callback parameters in the same module (esbuild bug with shared chunks).
const isTemplate = isNixTemplate;
const isKeyed = isKeyedList;

export interface ServerRenderOptions {
    markers?: "none" | "hydration";
    signal?: AbortSignal;
    onError?: (error: unknown) => void;
}

interface RenderState {
    markers: boolean;
    signal?: AbortSignal;
    onError?: (error: unknown) => void;
}

const renderContext = new AsyncLocalStorage<Map<unknown, unknown>[]>();
_setContextScopeResolver(() => renderContext.getStore());

export async function renderToString(value: unknown, options: ServerRenderOptions = {}): Promise<string> {
    const state: RenderState = {
        markers: options.markers === "hydration",
        signal: options.signal,
        onError: options.onError,
    };
    return renderContext.run([], () => renderValue(value, state));
}

async function renderValue(value: unknown, state: RenderState): Promise<string> {
    if (state.signal?.aborted) throw state.signal.reason ?? new DOMException("Render aborted", "AbortError");
    if (value instanceof Promise) return renderValue(await value, state);
    if (value === null || value === undefined || value === false || value === true) return "";
    if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") {
        return escapeText(String(value));
    }
    if (Array.isArray(value)) {
        const rendered = await Promise.all(value.map((item) => renderValue(item, state)));
        return rendered.join("");
    }
    if ((typeof value === "object" || typeof value === "function") && value !== null) {
        const protocol = (value as Record<PropertyKey, unknown>)[NIX_RENDER_PROTOCOL] as
            | { renderServer?: (context: { markers: boolean; signal?: AbortSignal; render(value: unknown, options?: { markers?: boolean }): Promise<string> }) => string | Promise<string> }
            | undefined;
        if (protocol?.renderServer) {
            return protocol.renderServer({
                markers: state.markers,
                signal: state.signal,
                render: (nested, options) => renderValue(nested, {
                    ...state,
                    markers: options?.markers ?? state.markers,
                }),
            });
        }
    }
    if (isNixComponent(value)) return renderComponent(value, state);
    if (isKeyed(value)) {
        const rendered = await Promise.all(value.items.map((item, index) => renderValue(value.renderFn(item, index), state)));
        return rendered.join("");
    }
    if (isTemplate(value)) return renderTemplate(value, state);
    return escapeText(String(value));
}

async function renderComponent(component: NixComponent, state: RenderState): Promise<string> {
    _pushComponentContext();
    try {
        try {
            component.onInit?.();
        } catch (error) {
            if (component.onError) component.onError(error);
            else throw error;
        }
        try {
            return await renderValue(component.render(), state);
        } catch (error) {
            if (component.onError) {
                component.onError(error);
                return "";
            }
            throw error;
        }
    } catch (error) {
        state.onError?.(error);
        throw error;
    } finally {
        _popComponentContext();
    }
}

async function renderTemplate(template: NixTemplate, state: RenderState): Promise<string> {
    const descriptor = template[NIX_TEMPLATE_DESCRIPTOR];
    if (!descriptor) throw new TypeError("[nix-js] Template does not support server rendering");
    return renderDescriptor(descriptor, state);
}

async function renderDescriptor(descriptor: TemplateDescriptor, state: RenderState): Promise<string> {
    const skipLeading = new Uint8Array(descriptor.strings.length);
    let result = "";

    for (let index = 0; index < descriptor.strings.length; index++) {
        if (state.signal?.aborted) throw state.signal.reason ?? new DOMException("Render aborted", "AbortError");
        let staticPart = descriptor.strings[index];
        if (skipLeading[index] === 1 && (staticPart[0] === '"' || staticPart[0] === "'")) {
            staticPart = staticPart.slice(1);
        }
        if (index >= descriptor.contexts.length) {
            result += staticPart;
            continue;
        }

        const context = descriptor.contexts[index];
        const value = descriptor.values[index];
        if (context.type === "node") {
            const rendered = await renderBindingValue(value, state);
            result += state.markers
                ? `${staticPart}<!--nix-${index}-->${rendered}<!--nix-end-${index}-->`
                : staticPart + rendered;
            continue;
        }

        const cut = bindingCut(context);
        result += staticPart.slice(0, -cut);
        if (context.hadOpenQuote) skipLeading[index + 1] = 1;
        if (context.type === "event") {
            if (state.markers) {
                const separator = /\s$/.test(result) ? "" : " ";
                result += `${separator}data-nix-e-${index}="${escapeAttribute(context.eventName)}"`;
            } else {
                result = result.replace(/\s+$/, "");
            }
            continue;
        }

        const resolved = await resolveBindingValue(value);
        if (context.attrName !== "ref" && resolved !== null && resolved !== undefined && resolved !== false) {
            const serialized = context.url ? sanitizeUrl(String(resolved)) : String(resolved);
            const separator = /\s$/.test(result) ? "" : " ";
            result += `${separator}${context.attrName}="${escapeAttribute(serialized)}"`;
        }
        if (state.markers) result += ` data-nix-a-${index}="${escapeAttribute(context.attrName)}"`;
    }

    return result;
}

async function renderBindingValue(value: unknown, state: RenderState): Promise<string> {
    const resolved = await resolveBindingValue(value);
    return renderValue(resolved, state);
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
