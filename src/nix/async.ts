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
    fallback?: NixTemplate;
    errorFallback?: (err: unknown) => NixTemplate;
    resetOnRefresh?: boolean;
    invalidate?: Signal<unknown>;
    cacheKey?: string;
    staleTime?: number;
}

export type QueryStatus = "pending" | "success" | "error";

export interface QueryResult<T> {
    /** Reactive signal with the current fetch status. */
    readonly status: Signal<QueryStatus>;
    /** Reactive signal with the resolved data. `undefined` while pending. */
    readonly data: Signal<T | undefined>;
    /** Reactive signal with the captured error. `undefined` if no error. */
    readonly error: Signal<unknown>;
    /** Clears the cache for this key and re-fetches immediately. */
    refetch(): void;
}

export interface QueryOptions {
    /**
     * Time in ms that cached data is considered fresh.
     * While fresh, mounting will not trigger a background refetch.
     * @default 0
     */
    staleTime?: number;
    /**
     * - `"always"` — background refetch on every mount (default).
     * - `"stale"`  — refetch only when data has exceeded `staleTime`.
     * - `false`    — never refetch on mount; only via `refetch()` or `invalidateQueries()`.
     * @default "always"
     */
    refetchOnMount?: "always" | "stale" | false;
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

// --- Global Query Cache ---

interface CacheEntry<T = unknown> {
    data?: T; // Ahora es opcional
    fetchedAt: number;
    subscribers: number;
}

const _queryCache = new Map<string, CacheEntry>();

const DEFAULT_CACHE_TIME = 5 * 60 * 1000;
let _gcTimer: ReturnType<typeof setInterval> | null = null;
let _cacheTime = DEFAULT_CACHE_TIME;

function _startGC(): void {
    if (_gcTimer !== null) return;
    _gcTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of _queryCache) {
            if (entry.subscribers <= 0 && now - entry.fetchedAt > _cacheTime) {
                _queryCache.delete(key);
            }
        }
        if (_queryCache.size === 0 && _gcTimer !== null) {
            clearInterval(_gcTimer);
            _gcTimer = null;
        }
    }, 60_000);
}

function _getCacheEntry<T>(key: string): CacheEntry<T> | undefined {
    const entry = _queryCache.get(key);
    // Solo retornamos hit si ya llegó la data real (fetchedAt > 0)
    if (entry && entry.fetchedAt > 0) return entry as CacheEntry<T>;
    return undefined;
}

function _setCacheEntry<T>(key: string, data: T): void {
    const existing = _queryCache.get(key);
    _queryCache.set(key, {
        data,
        fetchedAt: Date.now(),
        // Conservamos los subscriptores que se registraron mientras cargaba
        subscribers: existing?.subscribers ?? 0,
    });
    _startGC();
}

function _subscribe(key: string): void {
    const entry = _queryCache.get(key);
    if (entry) {
        entry.subscribers++;
    } else {
        // Creamos un cascarón temporal para no perder la cuenta de subscriptores
        _queryCache.set(key, { fetchedAt: 0, subscribers: 1 } as CacheEntry<any>);
    }
}

function _unsubscribe(key: string): void {
    const entry = _queryCache.get(key);
    if (entry) entry.subscribers = Math.max(0, entry.subscribers - 1);
}

function _isFresh(key: string, staleTime: number): boolean {
    const entry = _queryCache.get(key);
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < staleTime;
}

/**
 * Clears one or all entries from the global query cache.
 * Passing no argument clears everything.
 */
export function clearQueryCache(key?: string): void {
    if (key !== undefined) {
        _queryCache.delete(key);
    } else {
        _queryCache.clear();
        // Detenemos el timer global para evitar fugas de memoria entre tests
        if (_gcTimer !== null) {
            clearInterval(_gcTimer);
            _gcTimer = null;
        }
    }
}

/**
 * Sets how long cache entries with zero subscribers are kept alive.
 * @param ms Milliseconds. Pass `Infinity` to keep entries forever.
 */
export function setQueryCacheTime(ms: number): void {
    _cacheTime = ms;
}

// --- suspend() ---

/**
 * Runs an async function and renders based on its state (pending/resolved/error).
 *
 * ```ts
 * const refresh = signal(0);
 * suspend(() => fetchData(), render, { invalidate: refresh });
 * refresh.update(n => n + 1);
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
        cacheKey,
        staleTime = 0,
    } = options;

    const resolvedFallback = fallback ?? defaultLoadingFallback();
    const resolvedErrorFallback = errorFallback ?? defaultErrorTemplate;

    class SuspendComponent extends NixComponent {
        private _state: Signal<AsyncState<T>>;
        private _disposeWatcher: (() => void) | undefined;

        constructor() {
            super();
            const cached = cacheKey ? _getCacheEntry<T>(cacheKey) : undefined;

            // Validamos que cached.data no sea undefined para calmar a TypeScript
            this._state = signal<AsyncState<T>>(
                cached && cached.data !== undefined
                    ? { status: "resolved", data: cached.data }
                    : { status: "pending" }
            );
        }

        onMount(): (() => void) | void {
            if (cacheKey) _subscribe(cacheKey);

            const cached = cacheKey ? _getCacheEntry<T>(cacheKey) : undefined;

            if (cached && _isFresh(cacheKey!, staleTime)) {
                // fresh — skip
            } else if (cached) {
                this._fetch();
            } else {
                this._run();
            }

            if (invalidate) {
                let first = true;
                this._disposeWatcher = effect(() => {
                    invalidate.value;
                    if (first) { first = false; return; }
                    if (cacheKey) _queryCache.delete(cacheKey);
                    this._run();
                });
            }

            return () => {
                this._disposeWatcher?.();
                if (cacheKey) _unsubscribe(cacheKey);
            };
        }

        private _run(): void {
            if (resetOnRefresh || this._state.peek().status === "pending") {
                this._state.value = { status: "pending" };
            }
            this._fetch();
        }

        private _fetch(): void {
            asyncFn().then(
                (data) => {
                    if (cacheKey) _setCacheEntry(cacheKey, data);
                    this._state.value = { status: "resolved", data };
                },
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

const _queryRegistry = new Map<string, Set<WeakRef<() => void>>>();

const _registryCleanup = new FinalizationRegistry<{ key: string; ref: WeakRef<() => void> }>(
    ({ key, ref }) => {
        const handlers = _queryRegistry.get(key);
        if (!handlers) return;
        handlers.delete(ref);
        if (handlers.size === 0) _queryRegistry.delete(key);
    }
);

/**
 * Forces all active `createQuery()` instances with the given key to re-fetch.
 * Clears the cached data so subsequent mounts also fetch fresh data.
 * Instances that have been garbage-collected are pruned automatically.
 */
export function invalidateQueries(key: string): void {
    _queryCache.delete(key);
    const handlers = _queryRegistry.get(key);
    if (!handlers) return;
    for (const ref of handlers) {
        const fn = ref.deref();
        if (fn) {
            fn();
        } else {
            handlers.delete(ref);
        }
    }
    if (handlers.size === 0) _queryRegistry.delete(key);
}

/**
 * Key-based async data fetching with global cache and invalidation.
 * Returns reactive signals — render them directly in your component.
 *
 * Cache persists across route changes. Navigating back renders cached
 * data instantly, then background-refetches if stale.
 *
 * ```ts
 * class PostsPage extends NixComponent {
 *   private q = createQuery("posts", () => api.getPosts());
 *
 *   render() {
 *     return html`
 *       ${() => this.q.status.value === "pending" && html`<p>Loading…</p>`}
 *       ${() => this.q.status.value === "error"   && html`<p>Error</p>`}
 *       ${() => this.q.status.value === "success" && html`
 *         <ul>${() => repeat(this.q.data.value!, r => r.id,
 *           r => html`<li>${() => r.name}</li>`)}</ul>
 *       `}
 *     `;
 *   }
 * }
 *
 * // After a mutation:
 * invalidateQueries("posts");
 * ```
 */
export function createQuery<T>(
    key: string,
    asyncFn: () => Promise<T>,
    options: QueryOptions = {}
): QueryResult<T> {
    const { staleTime = 0, refetchOnMount = "always" } = options;

    const cached = _getCacheEntry<T>(key);
    const status = signal<QueryStatus>(cached ? "success" : "pending");
    const data = signal<T | undefined>(cached?.data);
    const error = signal<unknown>(undefined);

    const _fetch = (): void => {
        asyncFn().then(
            (result) => {
                _setCacheEntry(key, result);
                data.value = result;
                error.value = undefined;
                status.value = "success";
            },
            (err) => {
                error.value = err;
                status.value = "error";
            }
        );
    };

    const _run = (): void => {
        if (status.peek() === "pending") {
            data.value = undefined;
            error.value = undefined;
        }
        _fetch();
    };

    if (!_queryRegistry.has(key)) _queryRegistry.set(key, new Set());
    const handlers = _queryRegistry.get(key)!;
    const ref = new WeakRef(_run);
    handlers.add(ref);
    _registryCleanup.register(_run, { key, ref });

    const fresh = _isFresh(key, staleTime);
    if (!cached) {
        _run();
    } else if (refetchOnMount === false) {
        // skip
    } else if (refetchOnMount === "stale" && fresh) {
        // skip
    } else if (refetchOnMount === "always" && fresh && staleTime > 0) {
        // skip
    } else {
        _fetch();
    }

    return {
        status,
        data,
        error,
        refetch: () => {
            _queryCache.delete(key);
            _run();
        },
    };
}

// --- lazy() ---

/**
 * Wraps a dynamic import for lazy-loading route components.
 * The module is loaded once and cached. The imported module must use a default export.
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