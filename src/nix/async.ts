import { signal } from "./reactivity";
import { NixComponent } from "./lifecycle";
import type { NixTemplate } from "./template";
import { html } from "./template";

// --- Types ---

type AsyncState<T> =
    | { status: "pending" }
    | { status: "resolved"; data: T }
    | { status: "error"; error: unknown };

export interface SuspenseOptions {
    /** Template shown while the promise is pending. */
    fallback?: NixTemplate;
    /** Factory receiving the error, returns the error template. */
    errorFallback?: (err: unknown) => NixTemplate;
    /** If `true`, shows fallback during re-fetches instead of stale content. */
    resetOnRefresh?: boolean;
}

// --- suspend() ---

/**
 * Runs an async function and renders based on its state (pending/resolved/error).
 * Equivalent to the Suspense pattern in other frameworks.
 */
export function suspend<T>(
    asyncFn: () => Promise<T>,
    renderFn: (data: T) => NixTemplate | NixComponent,
    options: SuspenseOptions = {}
): NixComponent {
    const {
        fallback,
        errorFallback,
        resetOnRefresh = false,
    } = options;

    const defaultFallback = fallback ?? html`
        <span style="color:#52525b;font-size:13px;display:inline-flex;align-items:center;gap:6px">
            <span class="nix-spinner" style="
                display:inline-block;width:14px;height:14px;border-radius:50%;
                border:2px solid #38bdf840;border-top-color:#38bdf8;
                animation:nix-spin .7s linear infinite
            "></span>
            Loading…
        </span>
        <style>@keyframes nix-spin{to{transform:rotate(360deg)}}</style>
    `;

    const defaultErrorFallback = errorFallback ?? ((err: unknown) => html`
        <span style="color:#f87171;font-size:13px">
            ⚠ ${err instanceof Error ? err.message : String(err)}
        </span>
    `);

    class SuspendComponent extends NixComponent {
        private _state = signal<AsyncState<T>>({ status: "pending" });

        onMount(): void {
            this._run();
        }

        private _run(): void {
            if (resetOnRefresh || this._state.peek().status === "pending") {
                this._state.value = { status: "pending" };
            }
            asyncFn().then(
                (data) => { this._state.value = { status: "resolved", data }; },
                (err) => { this._state.value = { status: "error", error: err }; }
            );
        }

        render(): NixTemplate {
            return html`<div class="nix-suspense" style="display:contents">${() => {
                const s = this._state.value;
                if (s.status === "pending") return defaultFallback;
                if (s.status === "error") return defaultErrorFallback(s.error);
                return renderFn(s.data);
            }}</div>`;
        }
    }

    return new SuspendComponent();
}

// --- lazy() ---

/**
 * Wraps a dynamic import for lazy-loading route components.
 * The module is loaded once (cached). Compatible with `RouteRecord.component`.
 * The imported module must use a default export.
 */
export function lazy(
    importFn: () => Promise<{ default: new () => NixComponent }>,
    fallback?: NixTemplate
): () => NixComponent {
    // Cached constructor — null until loaded
    let Cached: (new () => NixComponent) | null = null;

    return (): NixComponent => {
        // Already loaded: instantiate directly (no Suspense)
        if (Cached) return new Cached();

        // First load: fetch the chunk and cache
        return suspend(
            async () => {
                const mod = await importFn();
                Cached = mod.default;
                return Cached;
            },
            (Comp) => new Comp(),
            { fallback }
        );
    };
}
