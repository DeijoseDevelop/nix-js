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
    /**
     * Optional cache key. When provided, resolved data is cached globally
     * so that subsequent mounts with the same key render cached data instantly,
     * similar to `createQuery` caching behaviour.
     */
    cacheKey?: string;
    /**
     * Time in milliseconds that cached data is considered fresh.
     * While fresh, no background refetch happens on mount.
     * Only used when `cacheKey` is set.
     * @default 0  (always stale — refetch in background on every mount)
     */
    staleTime?: number;
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
    data: T;
    /** Timestamp (Date.now()) when the data was last resolved. */
    fetchedAt: number;
    /** Number of active subscribers. Used for garbage-collection. */
    subscribers: number;
}

/** @internal Global cache of resolved query data. */
const _queryCache = new Map<string, CacheEntry>();

/** Default cache time: entries with 0 subscribers are removed after this period (ms). */
const DEFAULT_CACHE_TIME = 5 * 60 * 1000; // 5 minutes

/** @internal GC interval handle. */
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
        // Stop GC when cache is empty
        if (_queryCache.size === 0 && _gcTimer !== null) {
            clearInterval(_gcTimer);
            _gcTimer = null;
        }
    }, 60_000); // check every minute
}

/** @internal Read the cache entry for a key, if it exists. */
function _getCacheEntry<T>(key: string): CacheEntry<T> | undefined {
    return _queryCache.get(key) as CacheEntry<T> | undefined;
}

/** @internal Write resolved data into the cache for a key. */
function _setCacheEntry<T>(key: string, data: T): void {
    const existing = _queryCache.get(key);
    _queryCache.set(key, {
        data,
        fetchedAt: Date.now(),
        subscribers: existing?.subscribers ?? 0,
    });
    _startGC();
}

/** @internal Increment subscriber count for a cache key. */
function _subscribe(key: string): void {
    const entry = _queryCache.get(key);
    if (entry) entry.subscribers++;
}

/** @internal Decrement subscriber count for a cache key. */
function _unsubscribe(key: string): void {
    const entry = _queryCache.get(key);
    if (entry) entry.subscribers = Math.max(0, entry.subscribers - 1);
}

/** @internal Check whether cached data for a key is still fresh. */
function _isFresh(key: string, staleTime: number): boolean {
    const entry = _queryCache.get(key);
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < staleTime;
}

/**
 * Clear the query cache.
 * - Call with no arguments to clear **all** cached data.
 * - Pass a specific `key` to clear only that entry.
 */
export function clearQueryCache(key?: string): void {
    if (key !== undefined) {
        _queryCache.delete(key);
    } else {
        _queryCache.clear();
    }
}

/**
 * Set the global cache time (how long unused entries persist).
 * @param ms  Time in milliseconds. Pass `Infinity` to keep entries forever.
 */
export function setQueryCacheTime(ms: number): void {
    _cacheTime = ms;
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
 *
 * Pass `cacheKey` to enable caching — subsequent mounts render cached data
 * instantly without a loading spinner:
 * ```ts
 * suspend(() => fetchProfile(), render, { cacheKey: "profile" });
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
            // If cached data exists, start in resolved state
            const cached = cacheKey ? _getCacheEntry<T>(cacheKey) : undefined;
            this._state = signal<AsyncState<T>>(
                cached ? { status: "resolved", data: cached.data } : { status: "pending" }
            );
        }

        onMount(): (() => void) | void {
            if (cacheKey) _subscribe(cacheKey);

            const cached = cacheKey ? _getCacheEntry<T>(cacheKey) : undefined;

            if (cached && _isFresh(cacheKey!, staleTime)) {
                // Data is fresh — no refetch needed
            } else if (cached) {
                // Data exists but is stale — background refetch (no loading spinner)
                this._fetch();
            } else {
                // No cached data — full fetch with loading state
                this._run();
            }

            if (invalidate) {
                let first = true;
                this._disposeWatcher = effect(() => {
                    invalidate.value; // subscribe
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

        /** Full run: may show loading state. */
        private _run(): void {
            if (resetOnRefresh || this._state.peek().status === "pending") {
                this._state.value = { status: "pending" };
            }
            this._fetch();
        }

        /** Background fetch: does not reset to pending. */
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

/** @internal Global registry of active queries by key. */
const _queryRegistry = new Map<string, Set<() => void>>();

/**
 * Force all active `createQuery()` instances with the given key to re-fetch.
 * Also clears the cached data for this key so subsequent mounts will refetch.
 */
export function invalidateQueries(key: string): void {
    // Clear cache so new mounts don't use stale data
    _queryCache.delete(key);

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
    /**
     * Time in ms that cached data is considered fresh.
     * While fresh, mounting the query will **not** refetch — it renders cached
     * data instantly. Set to `Infinity` to never auto-refetch.
     * @default 0  (always stale — background refetch on every mount)
     */
    staleTime?: number;
    /**
     * Controls whether a background refetch happens when the component mounts.
     * - `"always"` — always refetch on mount (default; stale data shown instantly
     *     while the refetch runs in the background).
     * - `"stale"` — refetch only if cached data has exceeded `staleTime`.
     * - `false` — never refetch on mount; only manual `invalidateQueries()` refetches.
     * @default "always"
     */
    refetchOnMount?: "always" | "stale" | false;
}

/**
 * Key-based async data fetching with **built-in caching** and global
 * cache invalidation, similar to React Query / TanStack Query.
 *
 * Cached data is stored globally by `key`. When a component using
 * `createQuery` mounts:
 * 1. If cached data exists, it is rendered **immediately** (no loading spinner).
 * 2. A background refetch runs (unless the data is still "fresh" per `staleTime`).
 * 3. When the refetch resolves, the UI updates seamlessly.
 *
 * ```ts
 * createQuery("reservations", () => api.getAll(), (data) => html`...`);
 *
 * // After a mutation — clears cache & all active instances re-fetch:
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
        staleTime = 0,
        refetchOnMount = "always",
    } = options;

    const resolvedFallback = fallback ?? defaultLoadingFallback();
    const resolvedErrorFallback = errorFallback ?? defaultErrorTemplate;

    class QueryComponent extends NixComponent {
        private _state: Signal<AsyncState<T>>;

        constructor() {
            super();
            // Hydrate from cache if available
            const cached = _getCacheEntry<T>(key);
            this._state = signal<AsyncState<T>>(
                cached ? { status: "resolved", data: cached.data } : { status: "pending" }
            );
        }

        onMount(): (() => void) | void {
            // Register in global invalidation registry
            if (!_queryRegistry.has(key)) {
                _queryRegistry.set(key, new Set());
            }
            const handlers = _queryRegistry.get(key)!;
            const refetch = () => this._run();
            handlers.add(refetch);

            // Track subscriber for GC
            _subscribe(key);

            const cached = _getCacheEntry<T>(key);
            const fresh = _isFresh(key, staleTime);

            if (!cached) {
                // No cache — full fetch with loading state
                this._run();
            } else if (refetchOnMount === false) {
                // Never refetch on mount
            } else if (refetchOnMount === "stale" && fresh) {
                // Data is still fresh — skip refetch
            } else if (refetchOnMount === "always" && fresh && staleTime > 0) {
                // Data is fresh and user explicitly set a staleTime — skip refetch
            } else {
                // Background refetch (cached data already shown)
                this._fetch();
            }

            return () => {
                handlers.delete(refetch);
                if (handlers.size === 0) _queryRegistry.delete(key);
                _unsubscribe(key);
            };
        }

        /** Full run: may show loading state depending on resetOnRefresh. */
        private _run(): void {
            if (resetOnRefresh || this._state.peek().status === "pending") {
                this._state.value = { status: "pending" };
            }
            this._fetch();
        }

        /** Background fetch: does not reset to pending; updates cache on success. */
        private _fetch(): void {
            asyncFn().then(
                (data) => {
                    _setCacheEntry(key, data);
                    this._state.value = { status: "resolved", data };
                },
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
