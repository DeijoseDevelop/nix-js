import { signal, effect, Signal } from "./reactivity";
import { NixComponent } from "./lifecycle";
import { type NixTemplate, html, isNixTemplate } from "./template";

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

// --- Suspense Cache ---

interface SuspenseCacheEntry<T = unknown> {
    data?: T;
    fetchedAt: number;
    subscribers: number;
}

const _suspenseCache = new Map<string, SuspenseCacheEntry>();

const DEFAULT_CACHE_TIME = 5 * 60 * 1000;
let _suspenseGcTimer: ReturnType<typeof setInterval> | null = null;
let _suspenseCacheTime = DEFAULT_CACHE_TIME;

function _startSuspenseGC(): void {
    if (_suspenseGcTimer !== null) return;
    _suspenseGcTimer = setInterval(() => {
        const now = Date.now();
        for (const [key, entry] of _suspenseCache) {
            if (entry.subscribers <= 0 && now - entry.fetchedAt > _suspenseCacheTime) {
                _suspenseCache.delete(key);
            }
        }
        if (_suspenseCache.size === 0 && _suspenseGcTimer !== null) {
            clearInterval(_suspenseGcTimer);
            _suspenseGcTimer = null;
        }
    }, 60_000);
}

function _getSuspenseCacheEntry<T>(key: string): SuspenseCacheEntry<T> | undefined {
    const entry = _suspenseCache.get(key);
    if (entry && entry.fetchedAt > 0) return entry as SuspenseCacheEntry<T>;
    return undefined;
}

function _setSuspenseCacheEntry<T>(key: string, data: T): void {
    const existing = _suspenseCache.get(key);
    _suspenseCache.set(key, {
        data,
        fetchedAt: Date.now(),
        subscribers: existing?.subscribers ?? 0,
    });
    _startSuspenseGC();
}

function _subscribeSuspenseCache(key: string): void {
    const entry = _suspenseCache.get(key);
    if (entry) {
        entry.subscribers++;
    } else {
        _suspenseCache.set(key, { fetchedAt: 0, subscribers: 1 } as SuspenseCacheEntry<any>);
    }
}

function _unsubscribeSuspenseCache(key: string): void {
    const entry = _suspenseCache.get(key);
    if (entry) entry.subscribers = Math.max(0, entry.subscribers - 1);
}

function _isSuspenseCacheFresh(key: string, staleTime: number): boolean {
    const entry = _suspenseCache.get(key);
    if (!entry) return false;
    return Date.now() - entry.fetchedAt < staleTime;
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
            const cached = cacheKey ? _getSuspenseCacheEntry<T>(cacheKey) : undefined;

            this._state = signal<AsyncState<T>>(
                cached && cached.data !== undefined
                    ? { status: "resolved", data: cached.data }
                    : { status: "pending" }
            );
        }

        onMount(): (() => void) | void {
            if (cacheKey) _subscribeSuspenseCache(cacheKey);

            const cached = cacheKey ? _getSuspenseCacheEntry<T>(cacheKey) : undefined;

            if (cached && _isSuspenseCacheFresh(cacheKey!, staleTime)) {
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
                    if (cacheKey) _suspenseCache.delete(cacheKey);
                    this._run();
                });
            }

            return () => {
                this._disposeWatcher?.();
                if (cacheKey) _unsubscribeSuspenseCache(cacheKey);
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
                    if (cacheKey) _setSuspenseCacheEntry(cacheKey, data);
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

// --- lazy() ---

export interface LazyOptions {
    /** Component selector when the module uses a named export. Defaults to `mod.default`. */
    selector?: (mod: Record<string, unknown>) => new () => NixComponent;
    /** Template shown while the component is loading. */
    fallback?: NixTemplate;
}

/**
 * Wraps a dynamic import for lazy-loading route components.
 * The module is loaded once and cached. Supports both default and named exports.
 */
export function lazy(
    importFn: () => Promise<Record<string, unknown>>,
    options?: NixTemplate | LazyOptions
): () => NixComponent {
    const opts: LazyOptions =
        options === undefined || isNixTemplate(options as object)
            ? { fallback: options as NixTemplate | undefined }
            : (options as LazyOptions);

    const selector = opts.selector ?? ((mod) => mod.default as new () => NixComponent);
    let Cached: (new () => NixComponent) | null = null;

    return (): NixComponent => {
        if (Cached) return new Cached();

        return suspend(
            async () => {
                const mod = await importFn();
                Cached = selector(mod);
                return Cached;
            },
            (Comp) => new Comp(),
            { fallback: opts.fallback }
        );
    };
}