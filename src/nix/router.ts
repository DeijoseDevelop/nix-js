import { signal } from "./reactivity";
import type { Signal } from "./reactivity";
import { NixComponent } from "./lifecycle";
import type { NixTemplate } from "./template";
import { html } from "./template";
import { createInjectionKey, inject } from "./context";

// --- Public types ---

/**
 * Value returned (or resolved) by a navigation guard.
 * - `false`  — cancel the navigation.
 * - `string` — redirect to that path.
 * - `void` / `undefined` — allow the navigation.
 */
export type NavigationGuardResult = void | undefined | false | string;

/** Guard function invoked before navigation commits. */
export type NavigationGuard = (
    to: string,
    from: string,
) => NavigationGuardResult | Promise<NavigationGuardResult>;

export interface RouteRecord {
    /** Optional unique name to enable named navigation. */
    name?: string;
    /** Route path segment. Supports literals, params (`:id`), and wildcards (`*`). */
    path: string;
    /** Factory returning the view for this route level. */
    component: () => NixTemplate | NixComponent;
    /** Optional arbitrary metadata for guards, layouts, and auth checks. */
    meta?: Record<string, unknown>;
    /** Child routes. Paths are joined with the parent. */
    children?: RouteRecord[];
    /** Route-level guard. Runs only when entering this specific route. */
    beforeEnter?: NavigationGuard;
}

/**
 * Callback for `afterEach` hooks — receives the committed `to` and `from` paths.
 */
export type AfterEachHook = (to: string, from: string) => void;

/** Named route target for programmatic navigation. */
export interface NamedRouteLocation {
    name: string;
    params?: Record<string, string | number>;
    query?: Record<string, string | number | boolean | null | undefined>;
}

/** Navigation input accepted by `navigate` / `replace`. */
export type RouteLocation = string | NamedRouteLocation;

/** Serializable scroll position used by the router for history restoration. */
export interface ScrollPosition {
    left: number;
    top: number;
}

/**
 * Scroll behavior callback.
 * - `savedPosition` is non-null on popstate (back/forward) when a saved position exists.
 * - Return `{ left, top }` to scroll there.
 * - Return `false` or `undefined` to skip router scrolling.
 */
export type ScrollBehavior = (
    to: string,
    from: string,
    savedPosition: ScrollPosition | null,
) => ScrollPosition | false | void;

/** Router URL mode strategy. */
export type RouterMode = "history" | "hash";

/**
 * Result of `router.resolve(path)` — inspect what would match without navigating.
 */
export interface ResolvedRoute {
    /** Whether the path matched any registered route. */
    matched: boolean;
    /** Extracted route params (empty object if no match). */
    params: Record<string, string>;
    /** The matched route record, or `undefined` if no match. */
    route: RouteRecord | undefined;
}

/**
 * Options for `createRouter()`.
 */
export interface RouterOptions {
    /**
     * Base path for the application.
     * Useful when deploying under a sub-path (e.g. GitHub Pages).
     *
     * If omitted, the router auto-detects the base from the `<base href>` tag
     * that tools like Vite inject when you set `base` in your config.
     *
     * @example
     * // vite.config.ts sets base: "/my-app/"
     * // No need to pass base — auto-detected from <base href>
     * createRouter(routes);
     *
     * // Or pass it explicitly:
     * createRouter(routes, { base: "/my-app/" });
     */
    base?: string;
    /** URL handling mode. `history` by default. */
    mode?: RouterMode;
    /**
     * Optional custom scroll behavior for navigation.
     * If omitted, router scrolls to top on push/replace and restores saved
     * positions on back/forward when available.
     */
    scrollBehavior?: ScrollBehavior;
}

export interface Router {
    /** Signal with the current active pathname (without the base prefix). */
    readonly current: Signal<string>;
    /** Signal with the extracted dynamic route params. */
    readonly params: Signal<Record<string, string>>;
    /** Signal with the URL query params. */
    readonly query: Signal<Record<string, string>>;
    /** The resolved base path used by the router. */
    readonly base: string;
    /** Navigate to a new path via `pushState`. Guards run before committing. */
    navigate(location: RouteLocation, query?: Record<string, string | number | boolean | null | undefined>): void;
    /** Navigate via `replaceState` (no new history entry). Guards still run. */
    replace(location: RouteLocation, query?: Record<string, string | number | boolean | null | undefined>): void;
    /** Go back one entry in the browser history. */
    back(): void;
    /** Go forward one entry in the browser history. */
    forward(): void;
    /** Move `delta` entries in the browser history. */
    go(delta: number): void;
    /** Check if `path` is currently active. `exact=false` enables prefix matching. */
    isActive(path: string, exact?: boolean): boolean;
    /** Inspect what route would match `path` without navigating. */
    resolve(path: string): ResolvedRoute;
    /** Original route tree passed to `createRouter`. */
    readonly routes: RouteRecord[];
    /** Register a global navigation guard. Returns a removal function. */
    beforeEach(guard: NavigationGuard): () => void;
    /** Register a hook that runs after every successful navigation. Returns a removal function. */
    afterEach(hook: AfterEachHook): () => void;
}

/** DI key for router instances. Useful to mount multiple app trees with isolated routers. */
export const RouterKey = createInjectionKey<Router>("nix:router");

// --- Internals ---

type Segment =
    | { kind: "literal"; value: string }
    | { kind: "param"; name: string }
    | { kind: "wildcard" };

interface FlatRoute {
    fullPath: string;
    segments: Segment[];
    chain: Array<() => NixTemplate | NixComponent>;
    name?: string;
    meta?: Record<string, unknown>;
    beforeEnter?: NavigationGuard;
    record: RouteRecord;
}

interface RouterInternal extends Router {
    _flat: FlatRoute[];
    _guards: NavigationGuard[];
    _base: string;
    _mode: RouterMode;
}

/** Module-level singleton — the last router created with `createRouter()`. */
let _currentRouter: RouterInternal | null = null;
/** Cleanup function for the current router's popstate listener. */
let _currentPopstateCleanup: (() => void) | null = null;

const SCROLL_STATE_KEY = "__nix_scroll";

function getRouter(): RouterInternal {
    if (!_currentRouter) {
        throw new Error("[Nix] No active router. Call createRouter() first.");
    }
    return _currentRouter;
}

function getCurrentScrollPosition(): ScrollPosition {
    return {
        left: window.scrollX ?? window.pageXOffset ?? 0,
        top: window.scrollY ?? window.pageYOffset ?? 0,
    };
}

function readScrollPositionFromState(state: unknown): ScrollPosition | null {
    if (!state || typeof state !== "object") return null;
    const raw = (state as Record<string, unknown>)[SCROLL_STATE_KEY];
    if (!raw || typeof raw !== "object") return null;
    const left = (raw as Record<string, unknown>).left;
    const top = (raw as Record<string, unknown>).top;
    if (typeof left !== "number" || typeof top !== "number") return null;
    return { left, top };
}

function withScrollPositionInState(state: unknown, pos: ScrollPosition): Record<string, unknown> {
    const base = state && typeof state === "object"
        ? { ...(state as Record<string, unknown>) }
        : {};
    base[SCROLL_STATE_KEY] = { left: pos.left, top: pos.top };
    return base;
}

// --- Internal helpers ---

/** Parses a query string into a plain object. */
function parseQuery(search: string): Record<string, string> {
    const result: Record<string, string> = {};
    new URLSearchParams(search).forEach((v, k) => { result[k] = v; });
    return result;
}

/**
 * Builds a query string from an object.
 * Omits `null`/`undefined`/`false` values.
 */
function buildQueryString(
    q: Record<string, string | number | boolean | null | undefined>
): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
        if (v != null && v !== false) p.set(k, String(v));
    }
    const s = p.toString();
    return s ? "?" + s : "";
}
/** Parses a full path into its segments. */
function parseSegments(fullPath: string): Segment[] {
    if (fullPath === "*") return [{ kind: "wildcard" }];
    return fullPath
        .split("/")
        .filter(Boolean)
        .map((part): Segment => {
            if (part === "*") return { kind: "wildcard" };
            if (part.startsWith(":")) return { kind: "param", name: part.slice(1) };
            return { kind: "literal", value: part };
        });
}

/** Joins a parent path with a child segment, normalizing double slashes. */
function joinPaths(parent: string, child: string): string {
    if (child === "*") return parent === "" ? "*" : parent + "/*";
    const segment = child.startsWith("/") ? child : "/" + child;
    return (parent + segment).replace(/\/+/g, "/") || "/";
}

/** Flattens the route tree into a list with component chains. */
function flattenRoutes(
    routes: RouteRecord[],
    parentPath = "",
    parentChain: Array<() => NixTemplate | NixComponent> = []
): FlatRoute[] {
    const result: FlatRoute[] = [];
    for (const route of routes) {
        const fullPath = joinPaths(parentPath, route.path);
        const chain = [...parentChain, route.component];
        const segments = parseSegments(fullPath);
        result.push({
            fullPath,
            segments,
            chain,
            name: route.name,
            meta: route.meta,
            beforeEnter: route.beforeEnter,
            record: route,
        });
        if (route.children?.length) {
            result.push(...flattenRoutes(route.children, fullPath, chain));
        }
    }
    return result;
}

/** Attempts to match `path` against a `FlatRoute`. Returns extracted params or `null`. */
function tryMatch(path: string, route: FlatRoute): Record<string, string> | null {
    const parts = path.split("/").filter(Boolean);
    const segs = route.segments;

    // Global wildcard — matches everything
    if (segs.length === 1 && segs[0].kind === "wildcard") return {};

    // Prefix wildcard — last segment is "/*"
    const lastIsWild = segs.length > 0 && segs[segs.length - 1].kind === "wildcard";
    const fixedSegs = lastIsWild ? segs.slice(0, -1) : segs;

    if (lastIsWild) {
        if (parts.length < fixedSegs.length) return null;
    } else {
        if (parts.length !== fixedSegs.length) return null;
    }

    const params: Record<string, string> = {};
    for (let i = 0; i < fixedSegs.length; i++) {
        const seg = fixedSegs[i];
        if (seg.kind === "literal") {
            if (parts[i] !== seg.value) return null;
        } else if (seg.kind === "param") {
            try {
                params[seg.name] = decodeURIComponent(parts[i] ?? "");
            } catch {
                // Malformed percent-encoding (e.g. "%ZZ") — use raw segment
                params[seg.name] = parts[i] ?? "";
            }
        }
    }
    return params;
}

/** Route specificity score: literal=2, param=1, wildcard=0. Higher wins. */
function specificity(route: FlatRoute): number {
    return route.segments.reduce((acc, seg) => {
        if (seg.kind === "literal") return acc + 2;
        if (seg.kind === "param") return acc + 1;
        return acc;
    }, 0);
}

/** Finds the best matching route for `path` along with extracted params. */
function matchFlat(
    path: string,
    flat: FlatRoute[]
): { route: FlatRoute; params: Record<string, string> } | undefined {
    let best: FlatRoute | undefined;
    let bestParams: Record<string, string> = {};
    let bestScore = -1;

    for (const route of flat) {
        const params = tryMatch(path, route);
        if (params === null) continue;
        const score = specificity(route);
        if (score > bestScore) {
            best = route;
            bestParams = params;
            bestScore = score;
        }
    }

    return best ? { route: best, params: bestParams } : undefined;
}

// --- Base path helpers ---

/**
 * Normalizes a base path: ensures it starts with `/` and does NOT end with `/`.
 * Returns `""` for root base (no prefix needed).
 */
function normalizeBase(raw: string): string {
    let b = raw.trim();
    if (!b || b === "/") return "";
    if (!b.startsWith("/")) b = "/" + b;
    if (b.endsWith("/")) b = b.slice(0, -1);
    return b;
}

/**
 * Auto-detects the base from the `<base href>` tag in the document.
 * Vite injects this tag when you set `base` in `vite.config.ts`.
 */
function detectBase(): string {
    if (typeof document === "undefined") return "";
    const baseEl = document.querySelector("base");
    if (!baseEl) return "";
    const href = baseEl.getAttribute("href") || "";
    // <base href> can be a full URL or just a path
    try {
        const url = new URL(href, window.location.origin);
        return normalizeBase(url.pathname);
    } catch {
        return normalizeBase(href);
    }
}

// --- createRouter ---

/**
 * Creates the History API router and sets it as the active singleton.
 * In production the server must serve `index.html` for all non-file routes.
 *
 * @param routes  The route tree.
 * @param options Optional configuration — use `base` for sub-path deployments.
 */
export function createRouter(routes: RouteRecord[], options?: RouterOptions): Router {
    // Resolve the base path: explicit > auto-detect > root
    const _base = options?.base != null
        ? normalizeBase(options.base)
        : detectBase();
    const _mode: RouterMode = options?.mode ?? "history";
    const _isHashMode = _mode === "hash";
    const _scrollBehavior = options?.scrollBehavior;
    const _hashScrollPositions = new Map<string, ScrollPosition>();
    let _ignoreNextHashChange = false;

    function normalizeAppPath(raw: string): string {
        if (!raw) return "/";
        return raw.startsWith("/") ? raw : "/" + raw;
    }

    function stripBase(rawPath: string): string {
        const path = normalizeAppPath(rawPath || "/");
        if (_base && path.startsWith(_base)) {
            const stripped = path.slice(_base.length);
            return stripped === "" ? "/" : normalizeAppPath(stripped);
        }
        return path;
    }

    function withBase(appPath: string): string {
        const p = normalizeAppPath(appPath);
        if (!_base) return p;
        return (_base + p).replace(/\/+/g, "/") || "/";
    }

    function readHashLocation(): { pathname: string; search: string } {
        let raw = window.location.hash || "";
        if (raw.startsWith("#")) raw = raw.slice(1);
        if (!raw) return { pathname: "/", search: "" };
        if (!raw.startsWith("/")) raw = "/" + raw;
        const qIdx = raw.indexOf("?");
        const pathname = qIdx === -1 ? raw : raw.slice(0, qIdx);
        const search = qIdx === -1 ? "" : raw.slice(qIdx);
        return { pathname: stripBase(pathname), search };
    }

    function readLocation(): { pathname: string; search: string } {
        if (_isHashMode) return readHashLocation();
        return {
            pathname: stripBase(window.location.pathname || "/"),
            search: window.location.search || "",
        };
    }

    function buildUrl(pathname: string, stringQuery: Record<string, string>): string {
        const fullPath = withBase(pathname) + buildQueryString(stringQuery);
        return _isHashMode ? "#" + fullPath : fullPath;
    }

    function routeKey(pathname: string, stringQuery: Record<string, string>): string {
        return normalizeAppPath(pathname) + buildQueryString(stringQuery);
    }

    const initialLoc = readLocation();
    const initialPath = initialLoc.pathname;
    const initialQuery = parseQuery(initialLoc.search);
    const flat = flattenRoutes(routes);
    const _nameIndex = new Map<string, FlatRoute>();
    for (const route of flat) {
        if (!route.name) continue;
        if (_nameIndex.has(route.name)) {
            console.warn(`[Nix Router] Duplicate route name: "${route.name}"`);
        }
        _nameIndex.set(route.name, route);
    }
    const initialMatch = matchFlat(initialPath, flat);

    const current = signal(initialPath);
    const params = signal<Record<string, string>>(initialMatch?.params ?? {});
    const query = signal<Record<string, string>>(initialQuery);

    if (_isHashMode) {
        _hashScrollPositions.set(routeKey(initialPath, initialQuery), getCurrentScrollPosition());
    } else {
        // Ensure the current history entry has a serializable scroll position snapshot.
        history.replaceState(withScrollPositionInState(history.state, getCurrentScrollPosition()), "");
    }

    function _scrollTo(pos: ScrollPosition): void {
        window.scrollTo(pos.left, pos.top);
    }

    function _applyScroll(to: string, from: string, savedPosition: ScrollPosition | null): void {
        if (_scrollBehavior) {
            const result = _scrollBehavior(to, from, savedPosition);
            if (result === false || result == null) return;
            _scrollTo(result);
            return;
        }
        _scrollTo(savedPosition ?? { left: 0, top: 0 });
    }

    function _saveCurrentEntryScroll(pathname: string, stringQuery: Record<string, string>): void {
        const pos = getCurrentScrollPosition();
        if (_isHashMode) {
            _hashScrollPositions.set(routeKey(pathname, stringQuery), pos);
            return;
        }
        history.replaceState(withScrollPositionInState(history.state, pos), "");
    }

    // --- Guards & afterEach hooks ---
    const _guards: NavigationGuard[] = [];
    const _afterHooks: AfterEachHook[] = [];
    /** Monotonically increasing counter to cancel stale async guard chains. */
    let _navGeneration = 0;

    /**
     * Run global guards + optional route-level guard in sequence.
     * Calls `onCommit` if all pass, `onCancel` if any blocks.
     * Supports both sync and async guards.
     * If a new navigation starts while guards are pending, the stale chain
     * is silently abandoned (generation check).
     */
    function _runGuards(
        to: string,
        from: string,
        routeGuard: NavigationGuard | undefined,
        onCommit: () => void,
        onCancel?: () => void,
    ): void {
        const guards: NavigationGuard[] = [..._guards];
        if (routeGuard) guards.push(routeGuard);

        const gen = ++_navGeneration;

        if (guards.length === 0) { onCommit(); return; }

        let idx = 0;
        function runNext(prev: NavigationGuardResult): void {
            // Abandon if a newer navigation has started
            if (gen !== _navGeneration) return;

            if (prev === false) { onCancel?.(); return; }
            if (typeof prev === "string") {
                // Redirect — guard to same path is treated as allow to avoid loops
                if (prev !== to) navigate(prev);
                else onCommit();
                return;
            }
            if (idx >= guards.length) { onCommit(); return; }
            const result = guards[idx++](to, from);
            if (result instanceof Promise) { result.then(runNext); return; }
            runNext(result);
        }
        runNext(undefined);
    }

    // --- Navigation helpers ---
    /** Tracks whether navigate() has been called — used to skip the initial
     *  microtask guard check if the app already programmatically navigated. */
    let _hasNavigated = false;

    function _parsePath(
        path: string,
        queryObj?: Record<string, string | number | boolean | null | undefined>,
    ): { pathname: string; stringQuery: Record<string, string> } {
        const qIdx = path.indexOf("?");
        const rawPath = qIdx === -1 ? path : path.slice(0, qIdx);
        const pathname = normalizeAppPath(rawPath || "/");
        const inlineQ = qIdx === -1 ? {} : parseQuery(path.slice(qIdx));
        const finalQuery = queryObj ? { ...inlineQ, ...queryObj } : inlineQ;
        const stringQuery: Record<string, string> = {};
        for (const [k, v] of Object.entries(finalQuery)) {
            if (v != null && v !== false) stringQuery[k] = String(v);
        }
        return { pathname, stringQuery };
    }

    function _resolveNamedPath(location: NamedRouteLocation): string {
        const found = _nameIndex.get(location.name);
        if (!found) {
            throw new Error(`[Nix Router] No route with name "${location.name}"`);
        }

        const parts = found.segments.map((seg) => {
            if (seg.kind === "literal") return seg.value;
            if (seg.kind === "wildcard") return "";
            const value = location.params?.[seg.name];
            if (value == null) {
                throw new Error(
                    `[Nix Router] Missing param "${seg.name}" for route "${location.name}"`
                );
            }
            return encodeURIComponent(String(value));
        });

        return "/" + parts.filter(Boolean).join("/");
    }

    function _resolveLocation(
        location: RouteLocation,
        queryObj?: Record<string, string | number | boolean | null | undefined>,
    ): { pathname: string; stringQuery: Record<string, string> } {
        if (typeof location === "string") {
            return _parsePath(location, queryObj);
        }

        const pathname = _resolveNamedPath(location);
        const mergedQuery = { ...(location.query ?? {}), ...(queryObj ?? {}) };
        return _parsePath(pathname, mergedQuery);
    }

    // --- Route-change listener ---
    // Clean up any previous router listener
    if (_currentPopstateCleanup) {
        _currentPopstateCleanup();
        _currentPopstateCleanup = null;
    }

    const handleRouteChange = (
        p: string,
        newQuery: Record<string, string>,
        savedPos: ScrollPosition | null,
        onCancelRestore: (from: string, fromQuery: Record<string, string>) => void,
    ) => {
        const from = current.value;
        const fromQuery = { ...query.value }; // used to restore URL if guard cancels
        const m = matchFlat(p, flat);

        _runGuards(
            p,
            from,
            m?.route.beforeEnter,
            () => {
                params.value = m?.params ?? {};
                query.value = newQuery;
                current.value = p;
                _applyScroll(p, from, savedPos);
                // Fire afterEach hooks for popstate navigations
                for (const hook of _afterHooks) {
                    try { hook(p, from); } catch { /* ignore */ }
                }
            },
            () => onCancelRestore(from, fromQuery),
        );
    };

    if (_isHashMode) {
        const onHashChange = () => {
            if (_ignoreNextHashChange) {
                _ignoreNextHashChange = false;
                return;
            }
            const loc = readLocation();
            const nextQuery = parseQuery(loc.search);
            const savedPos = _hashScrollPositions.get(routeKey(loc.pathname, nextQuery)) ?? null;
            handleRouteChange(
                loc.pathname,
                nextQuery,
                savedPos,
                (from, fromQuery) => {
                    // Guard cancelled hashchange: restore previous hash
                    _ignoreNextHashChange = true;
                    window.location.hash = buildUrl(from, fromQuery).slice(1);
                    queueMicrotask(() => { _ignoreNextHashChange = false; });
                },
            );
        };
        window.addEventListener("hashchange", onHashChange);
        _currentPopstateCleanup = () => window.removeEventListener("hashchange", onHashChange);
    } else {
        const onPopstate = (ev: PopStateEvent) => {
            const loc = readLocation();
            const nextQuery = parseQuery(loc.search);
            const savedPos = readScrollPositionFromState(ev.state ?? history.state);
            handleRouteChange(
                loc.pathname,
                nextQuery,
                savedPos,
                (from, fromQuery) => {
                    // Guard cancelled popstate: restore previous URL without triggering another popstate
                    history.pushState(
                        withScrollPositionInState({}, getCurrentScrollPosition()),
                        "",
                        buildUrl(from, fromQuery),
                    );
                },
            );
        };
        window.addEventListener("popstate", onPopstate);
        _currentPopstateCleanup = () => window.removeEventListener("popstate", onPopstate);
    }

    // --- Internal: commit navigation + fire afterEach hooks ---
    function _commit(
        pathname: string,
        stringQuery: Record<string, string>,
        from: string,
        fromQuery: Record<string, string>,
        m: ReturnType<typeof matchFlat>,
        useReplace: boolean,
    ): void {
        if (!useReplace) {
            // Snapshot the current entry before creating the next history entry.
            _saveCurrentEntryScroll(from, fromQuery);
        }

        params.value = m?.params ?? {};
        query.value = stringQuery;
        current.value = pathname;
        const url = buildUrl(pathname, stringQuery);

        if (_isHashMode) {
            _hashScrollPositions.set(routeKey(pathname, stringQuery), { left: 0, top: 0 });
            if (useReplace) {
                history.replaceState(history.state, "", url);
            } else {
                _ignoreNextHashChange = true;
                window.location.hash = url.slice(1);
                queueMicrotask(() => { _ignoreNextHashChange = false; });
            }
        } else {
            const nextState = withScrollPositionInState({}, { left: 0, top: 0 });
            if (useReplace) {
                history.replaceState(nextState, "", url);
            } else {
                history.pushState(nextState, "", url);
            }
        }

        _applyScroll(pathname, from, null);
        // Fire afterEach hooks
        for (const hook of _afterHooks) {
            try { hook(pathname, from); } catch { /* ignore */ }
        }
    }

    // --- navigate ---
    function navigate(
        location: RouteLocation,
        queryObj?: Record<string, string | number | boolean | null | undefined>,
    ): void {
        _hasNavigated = true;
        const { pathname, stringQuery } = _resolveLocation(location, queryObj);
        const from = current.value;
        const fromQuery = { ...query.value };
        const m = matchFlat(pathname, flat);

        _runGuards(
            pathname,
            from,
            m?.route.beforeEnter,
            () => _commit(pathname, stringQuery, from, fromQuery, m, false),
        );
    }

    // --- replace ---
    function replace(
        location: RouteLocation,
        queryObj?: Record<string, string | number | boolean | null | undefined>,
    ): void {
        _hasNavigated = true;
        const { pathname, stringQuery } = _resolveLocation(location, queryObj);
        const from = current.value;
        const fromQuery = { ...query.value };
        const m = matchFlat(pathname, flat);

        _runGuards(
            pathname,
            from,
            m?.route.beforeEnter,
            () => _commit(pathname, stringQuery, from, fromQuery, m, true),
        );
    }

    // --- back / forward / go ---
    function back(): void { history.back(); }
    function forward(): void { history.forward(); }
    function go(delta: number): void { history.go(delta); }

    // --- isActive ---
    function isActive(path: string, exact = true): boolean {
        const cur = current.value;
        if (exact) return cur === path;
        return cur === path || cur.startsWith(path.endsWith("/") ? path : path + "/");
    }

    // --- resolve ---
    function resolve(path: string): ResolvedRoute {
        const m = matchFlat(path, flat);
        if (!m) return { matched: false, params: {}, route: undefined };
        return { matched: true, params: m.params, route: m.route.record };
    }

    // --- beforeEach ---
    function beforeEach(guard: NavigationGuard): () => void {
        _guards.push(guard);
        return () => {
            const idx = _guards.indexOf(guard);
            if (idx !== -1) _guards.splice(idx, 1);
        };
    }

    // --- afterEach ---
    function afterEach(hook: AfterEachHook): () => void {
        _afterHooks.push(hook);
        return () => {
            const idx = _afterHooks.indexOf(hook);
            if (idx !== -1) _afterHooks.splice(idx, 1);
        };
    }

    const router: RouterInternal = {
        current, params, query, base: _base || "/", navigate, replace,
        back, forward, go, isActive, resolve,
        beforeEach, afterEach, routes, _flat: flat, _guards, _base, _mode,
    };

    if (_currentRouter) {
        console.warn(
            "[Nix] A router already exists. The previous router is being replaced. " +
            "Only one router instance should be active at a time."
        );
    }
    _currentRouter = router;

    // --- Initial navigation guard check ---
    // Guards are registered after createRouter() returns, so defer to a microtask.
    queueMicrotask(() => {
        // Skip if the app already navigated programmatically — the navigate()
        // call already ran guards on the new destination.
        if (_hasNavigated) return;

        const m = matchFlat(initialPath, flat);
        _runGuards(
            initialPath,
            "",   // no "from" on first load
            m?.route.beforeEnter,
            () => { /* allowed — current/params/query already reflect initial path */ },
            () => {
                // Guard returned false with no redirect: fall back to root
                const fallback = "/";
                const url = buildUrl(fallback, {});
                if (_isHashMode) {
                    _hashScrollPositions.set(routeKey(fallback, {}), { left: 0, top: 0 });
                    history.replaceState(history.state, "", url);
                } else {
                    history.replaceState(
                        withScrollPositionInState({}, { left: 0, top: 0 }),
                        "",
                        url,
                    );
                }
                const fm = matchFlat(fallback, flat);
                current.value = fallback;
                params.value = fm?.params ?? {};
                query.value = {};
                _applyScroll(fallback, initialPath, null);
            },
        );
    });

    return router;
}

/** Returns the active router singleton. */
export function useRouter(): Router {
    const injected = inject(RouterKey);
    if (injected) return injected;
    return getRouter();
}

/**
 * @internal — Resets the router singleton. Used by tests to avoid
 * "A router already exists" warnings between test cases.
 */
export function _resetRouter(): void {
    if (_currentPopstateCleanup) {
        _currentPopstateCleanup();
        _currentPopstateCleanup = null;
    }
    _currentRouter = null;
}

// --- RouterView ---

/** Renders the matched route component at the given nesting `depth`. */
export class RouterView extends NixComponent {
    private _depth: number;

    constructor(depth = 0) {
        super();
        this._depth = depth;
    }

    render(): NixTemplate {
        const depth = this._depth;
        return html`<div class="router-view">${() => {
            const router = useRouter() as RouterInternal;
            const matched = matchFlat(router.current.value, router._flat);

            if (!matched) {
                return html`<div style="color:#f87171;padding:16px 0">
          404 — Route not found: <strong>${router.current.value}</strong>
        </div>`;
            }

            if (depth >= matched.route.chain.length) {
                // No component registered at this nesting level
                return html`<span></span>`;
            }

            return matched.route.chain[depth]();
        }}</div>`;
    }
}

// --- Link ---

/** Reactive navigation link styled as active/inactive based on the current route. */
export class Link extends NixComponent {
    private _to: string;
    private _label: string;

    constructor(to: string, label: string) {
        super();
        this._to = to;
        this._label = label;
    }

    render(): NixTemplate {
        const to = this._to;
        const label = this._label;
        const router = useRouter() as RouterInternal;
        const appPath = to.startsWith("/") ? to : "/" + to;
        const fullPath = (router._base ? (router._base + appPath) : appPath).replace(/\/+/g, "/");
        const href = router._mode === "hash" ? "#" + fullPath : fullPath;
        return html`<a
      href=${href}
      style=${() => {
                return router.current.value === to
                    ? "color:#38bdf8;font-weight:700;text-decoration:none;cursor:pointer;padding:4px 10px;border-radius:4px;background:#0c2a3a"
                    : "color:#a3a3a3;text-decoration:none;cursor:pointer;padding:4px 10px;border-radius:4px";
            }}
      @click=${(e: Event) => {
                e.preventDefault();
                router.navigate(to);
            }}
    >${label}</a>`;
    }
}
