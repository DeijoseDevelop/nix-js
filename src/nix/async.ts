import { signal, effect, Signal } from "./reactivity";
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
    /** Signal that triggers a re-fetch when its value changes. DOM is reused. */
    invalidate?: Signal<unknown>;
}

// --- Default fallbacks ---

function defaultLoadingFallback(): NixTemplate {
    return html`
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
}

function defaultErrorTemplate(err: unknown): NixTemplate {
    return html`
        <span style="color:#f87171;font-size:13px">
            ⚠ ${err instanceof Error ? err.message : String(err)}
        </span>
    `;
}

// --- suspend() ---

/**
 * Runs an async function and renders based on its state (pending/resolved/error).
 * Equivalent to the Suspense pattern in other frameworks.
 *
 * Pass `invalidate` to re-fetch without destroying the DOM:
 * ```ts
 * const refresh = signal(0);
 * suspend(() => fetchData(), render, { invalidate: refresh });
 * // later: refresh.update(n => n + 1);
 * ```
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
        invalidate,
    } = options;

    const resolvedFallback = fallback ?? defaultLoadingFallback();
    const resolvedErrorFallback = errorFallback ?? defaultErrorTemplate;

    class SuspendComponent extends NixComponent {
        private _state = signal<AsyncState<T>>({ status: "pending" });
        private _disposeWatcher: (() => void) | undefined;

        onMount(): (() => void) | void {
            this._run();

            if (invalidate) {
                let first = true;
                this._disposeWatcher = effect(() => {
                    invalidate.value; // subscribe
                    if (first) { first = false; return; }
                    this._run();
                });
            }

            return () => { this._disposeWatcher?.(); };
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
                if (s.status === "pending") return resolvedFallback;
                if (s.status === "error") return resolvedErrorFallback(s.error);
                return renderFn(s.data);
            }}</div>`;
        }
    }

    return new SuspendComponent();
}

// --- createQuery() / invalidateQueries() ---

/** @internal Global registry of active queries by key. */
const _queryRegistry = new Map<string, Set<() => void>>();

/** Force all active `createQuery()` instances with the given key to re-fetch. */
export function invalidateQueries(key: string): void {
    const handlers = _queryRegistry.get(key);
    if (handlers) {
        for (const refetch of handlers) refetch();
    }
}

export interface QueryOptions {
    /** Template shown while the promise is pending. */
    fallback?: NixTemplate;
    /** Factory receiving the error, returns the error template. */
    errorFallback?: (err: unknown) => NixTemplate;
    /** If `true`, shows fallback during re-fetches instead of stale content. */
    resetOnRefresh?: boolean;
}

/**
 * Key-based async data fetching with global cache invalidation.
 *
 * ```ts
 * createQuery("reservations", () => api.getAll(), {
 *   renderFn: (data) => html`...`,
 * });
 *
 * // After a mutation — any component using this key re-fetches:
 * invalidateQueries("reservations");
 * ```
 */
export function createQuery<T>(
    key: string,
    asyncFn: () => Promise<T>,
    renderFn: (data: T) => NixTemplate | NixComponent,
    options: QueryOptions = {}
): NixComponent {
    const {
        fallback,
        errorFallback,
        resetOnRefresh = false,
    } = options;

    const resolvedFallback = fallback ?? defaultLoadingFallback();
    const resolvedErrorFallback = errorFallback ?? defaultErrorTemplate;

    class QueryComponent extends NixComponent {
        private _state = signal<AsyncState<T>>({ status: "pending" });

        onMount(): (() => void) | void {
            // Register in global registry
            if (!_queryRegistry.has(key)) {
                _queryRegistry.set(key, new Set());
            }
            const handlers = _queryRegistry.get(key)!;
            const refetch = () => this._run();
            handlers.add(refetch);

            this._run();

            return () => {
                handlers.delete(refetch);
                if (handlers.size === 0) _queryRegistry.delete(key);
            };
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
            return html`<div class="nix-query" style="display:contents">${() => {
                const s = this._state.value;
                if (s.status === "pending") return resolvedFallback;
                if (s.status === "error") return resolvedErrorFallback(s.error);
                return renderFn(s.data);
            }}</div>`;
        }
    }

    return new QueryComponent();
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
    let Cached: (new () => NixComponent) | null = null;

    return (): NixComponent => {
        if (Cached) return new Cached();

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
