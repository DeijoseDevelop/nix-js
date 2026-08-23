import { signal } from "./reactivity.js";
import type { Signal } from "./reactivity.js";
import { NixComponent } from "./lifecycle.js";
import type { NixTemplate } from "./template/index.js";
import { html } from "./template/index.js";
import { createInjectionKey, inject } from "./context.js";

// =============================================================================
//  Public types
// =============================================================================

/**
 * Value returned (or resolved) by a navigation guard.
 *
 * - `true` / `void` / `undefined` — allow.
 * - `false` — cancel (no redirect).
 * - `string` — redirect to that path.
 * - `{ redirect: string }` — redirect, object form.
 *
 * The object form exists so guards written for the outlet API can be reused
 * verbatim by the core. See `nix-ionic`'s `GuardResult`.
 */
export type NavigationGuardResult =
    | void
    | undefined
    | boolean
    | string
    | { redirect: string };

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
    /**
     * Factory returning the view for this route level.
     *
     * OPTIONAL — when the core router is auto-bootstrapped by an outlet
     * (Ionic's IonRouterOutlet, future others), the outlet owns component
     * mounting and the core never invokes this. In that case, omit it.
     */
    component?: () => NixTemplate | NixComponent;
    /** Optional arbitrary metadata for guards, layouts, and auth checks. */
    meta?: Record<string, unknown>;
    /** Child routes. Paths are joined with the parent. */
    children?: RouteRecord[];
    /** Route-level guard. Runs only when entering this specific route. */
    beforeEnter?: NavigationGuard;
}

/** Callback for `afterEach` hooks — receives the committed `to` and `from` paths. */
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

export type ScrollBehavior = (
    to: string,
    from: string,
    savedPosition: ScrollPosition | null,
) => ScrollPosition | false | void;

export type RouterMode = "history" | "hash";

export interface ResolvedRoute {
    matched: boolean;
    params: Record<string, string>;
    route: RouteRecord | undefined;
}

// -----------------------------------------------------------------------------
//  Navigation intent
// -----------------------------------------------------------------------------

export type NavigationAction = "push" | "replace" | "pop" | "initial";
export type NavigationDirection = "forward" | "back" | "root" | "none";

export interface NavigationIntent {
    action: NavigationAction;
    direction: NavigationDirection;
    animation?: unknown;
}

export interface NavigateOptions {
    query?: Record<string, string | number | boolean | null | undefined>;
    direction?: NavigationDirection;
    animation?: unknown;
}

export interface RouterOptions {
    base?: string;
    mode?: RouterMode;
    scrollBehavior?: ScrollBehavior;
}

export interface Router {
    readonly current: Signal<string>;
    readonly params: Signal<Record<string, string>>;
    readonly query: Signal<Record<string, string>>;
    readonly base: string;
    readonly intent: Signal<NavigationIntent>;
    readonly canGoBack: Signal<boolean>;
    navigate(location: RouteLocation, options?: NavigateOptions): void;
    replace(location: RouteLocation, options?: NavigateOptions): void;
    back(animation?: unknown): void;
    forward(animation?: unknown): void;
    go(delta: number): void;
    isActive(path: string, exact?: boolean): boolean;
    resolve(path: string): ResolvedRoute;
    readonly routes: RouteRecord[];
    beforeEach(guard: NavigationGuard): () => void;
    afterEach(hook: AfterEachHook): () => void;
}

export const RouterKey = createInjectionKey<Router>("nix:router");

// =============================================================================
//  Internals
// =============================================================================

type Segment =
    | { kind: "literal"; value: string }
    | { kind: "param"; name: string }
    | { kind: "wildcard" };

interface FlatRoute {
    fullPath: string;
    segments: Segment[];
    chain: Array<(() => NixTemplate | NixComponent) | undefined>;
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

let _currentRouter: RouterInternal | null = null;
let _currentPopstateCleanup: (() => void) | null = null;

// Routers injected via mount({ router }) are not the global singleton. DevTools
// tracks them separately so it can inspect the router actually active in the UI.
const _mountedRouters: Router[] = [];

const SCROLL_STATE_KEY = "__nix_scroll";
const POSITION_STATE_KEY = "__nix_pos";

function getRouter(): RouterInternal {
    if (!_currentRouter) {
        throw new Error(
            "[nix-js] No active router. Call createRouter() first, " +
            "or instantiate an outlet that auto-bootstraps one (e.g. IonRouterOutlet)."
        );
    }
    return _currentRouter;
}

/**
 * @internal Whether a router is currently active. Used by outlets that
 * want to auto-bootstrap if the user didn't call `createRouter()` themselves.
 */
export function _hasActiveRouter(): boolean {
    return _currentRouter !== null;
}

// =============================================================================
//  History state helpers
// =============================================================================

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

function readPositionFromState(state: unknown): number | null {
    if (!state || typeof state !== "object") return null;
    const raw = (state as Record<string, unknown>)[POSITION_STATE_KEY];
    return typeof raw === "number" ? raw : null;
}

function buildHistoryState(
    prev: unknown,
    scroll: ScrollPosition,
    position: number,
): Record<string, unknown> {
    const base = prev && typeof prev === "object"
        ? { ...(prev as Record<string, unknown>) }
        : {};
    base[SCROLL_STATE_KEY] = { left: scroll.left, top: scroll.top };
    base[POSITION_STATE_KEY] = position;
    return base;
}

// =============================================================================
//  Query / path helpers
// =============================================================================

function parseQuery(search: string): Record<string, string> {
    const result: Record<string, string> = {};
    new URLSearchParams(search).forEach((v, k) => { result[k] = v; });
    return result;
}

function buildQueryString(
    q: Record<string, string | number | boolean | null | undefined>,
): string {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(q)) {
        if (v != null && v !== false) p.set(k, String(v));
    }
    const s = p.toString();
    return s ? "?" + s : "";
}

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

function joinPaths(parent: string, child: string): string {
    if (child === "*") return parent === "" ? "*" : parent + "/*";
    const segment = child.startsWith("/") ? child : "/" + child;
    return (parent + segment).replace(/\/+/g, "/") || "/";
}

function flattenRoutes(
    routes: RouteRecord[],
    parentPath = "",
    parentChain: Array<(() => NixTemplate | NixComponent) | undefined> = [],
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

function tryMatch(path: string, route: FlatRoute): Record<string, string> | null {
    const parts = path.split("/").filter(Boolean);
    const segs = route.segments;
    if (segs.length === 1 && segs[0].kind === "wildcard") return {};
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
                params[seg.name] = parts[i] ?? "";
            }
        }
    }
    return params;
}

function specificity(route: FlatRoute): number {
    return route.segments.reduce((acc, seg) => {
        if (seg.kind === "literal") return acc + 2;
        if (seg.kind === "param") return acc + 1;
        return acc;
    }, 0);
}

function matchFlat(
    path: string,
    flat: FlatRoute[],
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

// =============================================================================
//  Base path helpers
// =============================================================================

function normalizeBase(raw: string): string {
    let b = raw.trim();
    if (!b || b === "/") return "";
    if (!b.startsWith("/")) b = "/" + b;
    if (b.endsWith("/")) b = b.slice(0, -1);
    return b;
}

function detectBase(): string {
    if (typeof document === "undefined") return "";
    const baseEl = document.querySelector("base");
    if (!baseEl) return "";
    const href = baseEl.getAttribute("href") || "";
    try {
        const url = new URL(href, window.location.origin);
        return normalizeBase(url.pathname);
    } catch {
        return normalizeBase(href);
    }
}

// =============================================================================
//  Guard result normalization
// =============================================================================

/**
 * Normalize any guard result into the internal flow's {allow, redirect} shape.
 * Accepts: `true`, `false`, `void`/`undefined`, `string`, `{ redirect: string }`.
 */
function normalizeGuardResult(
    r: NavigationGuardResult,
): { allow: boolean; redirect?: string } {
    if (r === false) return { allow: false };
    if (r === true || r === undefined || r === null) return { allow: true };
    if (typeof r === "string") return { allow: false, redirect: r };
    if (typeof r === "object" && "redirect" in r && typeof r.redirect === "string") {
        return { allow: false, redirect: r.redirect };
    }
    // Unknown — be permissive rather than break navigation.
    return { allow: true };
}

// =============================================================================
//  createRouter
// =============================================================================

export function createRouter(routes: RouteRecord[], options?: RouterOptions): Router {
    const _base = options?.base != null ? normalizeBase(options.base) : detectBase();
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

    // -------------------------------------------------------------------------
    //  Initial state
    // -------------------------------------------------------------------------

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

    let _currentPosition = readPositionFromState(history.state) ?? 0;

    const intent = signal<NavigationIntent>({
        action: "initial",
        direction: "none",
    });

    const canGoBack = signal<boolean>(_currentPosition > 0);

    if (_isHashMode) {
        _hashScrollPositions.set(routeKey(initialPath, initialQuery), getCurrentScrollPosition());
    } else {
        history.replaceState(
            buildHistoryState(history.state, getCurrentScrollPosition(), _currentPosition),
            "",
        );
    }

    // -------------------------------------------------------------------------
    //  Scroll
    // -------------------------------------------------------------------------

    function _scrollTo(pos: ScrollPosition): void {
        window.scrollTo(pos.left, pos.top);
    }

    function _applyScroll(to: string, from: string, savedPosition: ScrollPosition | null): void {
        if (_scrollBehavior) {
            const result = _scrollBehavior(to, from, savedPosition);
            if (!result) return;
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
        history.replaceState(
            buildHistoryState(history.state, pos, _currentPosition),
            "",
        );
    }

    // -------------------------------------------------------------------------
    //  Guards
    // -------------------------------------------------------------------------

    const _guards: NavigationGuard[] = [];
    const _afterHooks: AfterEachHook[] = [];
    let _navGeneration = 0;

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
            if (gen !== _navGeneration) return;

            const norm = normalizeGuardResult(prev);
            if (!norm.allow) {
                if (norm.redirect && norm.redirect !== to) {
                    navigate(norm.redirect);
                    return;
                }
                if (norm.redirect === to) {
                    // Guarding TO the same path — treat as allow to avoid loops
                    onCommit();
                    return;
                }
                onCancel?.();
                return;
            }
            if (idx >= guards.length) { onCommit(); return; }
            const result = guards[idx++](to, from);
            if (result instanceof Promise) { result.then(runNext); return; }
            runNext(result);
        }
        runNext(undefined);
    }

    // -------------------------------------------------------------------------
    //  Path / location resolution
    // -------------------------------------------------------------------------

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
                    `[Nix Router] Missing param "${seg.name}" for route "${location.name}"`,
                );
            }
            return encodeURIComponent(String(value));
        });
        return "/" + parts.filter(Boolean).join("/");
    }

    function _resolveLocation(
        location: RouteLocation,
        options?: NavigateOptions,
    ): { pathname: string; stringQuery: Record<string, string> } {
        if (typeof location === "string") {
            return _parsePath(location, options?.query);
        }
        const pathname = _resolveNamedPath(location);
        const mergedQuery = { ...(location.query ?? {}), ...(options?.query ?? {}) };
        return _parsePath(pathname, mergedQuery);
    }

    // -------------------------------------------------------------------------
    //  Popstate / hashchange listener
    // -------------------------------------------------------------------------

    if (_currentPopstateCleanup) {
        _currentPopstateCleanup();
        _currentPopstateCleanup = null;
    }

    const handleBrowserNav = (
        p: string,
        newQuery: Record<string, string>,
        savedPos: ScrollPosition | null,
        nextPosition: number | null,
        onCancelRestore: (from: string, fromQuery: Record<string, string>) => void,
    ) => {
        const from = current.value;
        const fromQuery = { ...query.value };
        const m = matchFlat(p, flat);

        let direction: NavigationDirection = "none";
        if (nextPosition != null) {
            if (nextPosition < _currentPosition) direction = "back";
            else if (nextPosition > _currentPosition) direction = "forward";
        }

        _runGuards(
            p,
            from,
            m?.route.beforeEnter,
            () => {
                if (nextPosition != null) _currentPosition = nextPosition;
                const animation = _pendingPopAnimation;
                _pendingPopAnimation = undefined;
                intent.value = { action: "pop", direction, animation };
                params.value = m?.params ?? {};
                query.value = newQuery;
                current.value = p;
                canGoBack.value = _currentPosition > 0;
                _applyScroll(p, from, savedPos);
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
            handleBrowserNav(
                loc.pathname,
                nextQuery,
                savedPos,
                null,
                (from, fromQuery) => {
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
            const nextPos = readPositionFromState(ev.state ?? history.state);
            handleBrowserNav(
                loc.pathname,
                nextQuery,
                savedPos,
                nextPos,
                (from, fromQuery) => {
                    history.pushState(
                        buildHistoryState({}, getCurrentScrollPosition(), _currentPosition),
                        "",
                        buildUrl(from, fromQuery),
                    );
                },
            );
        };
        window.addEventListener("popstate", onPopstate);
        _currentPopstateCleanup = () => window.removeEventListener("popstate", onPopstate);
    }

    // -------------------------------------------------------------------------
    //  Internal commit (programmatic navigation)
    // -------------------------------------------------------------------------

    function _commit(
        pathname: string,
        stringQuery: Record<string, string>,
        from: string,
        fromQuery: Record<string, string>,
        m: ReturnType<typeof matchFlat>,
        nextIntent: NavigationIntent,
        useReplace: boolean,
    ): void {
        if (!useReplace) {
            _saveCurrentEntryScroll(from, fromQuery);
            _currentPosition += 1;
        }

        intent.value = nextIntent;
        params.value = m?.params ?? {};
        query.value = stringQuery;
        current.value = pathname;
        canGoBack.value = _currentPosition > 0;

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
            const nextState = buildHistoryState({}, { left: 0, top: 0 }, _currentPosition);
            if (useReplace) {
                history.replaceState(nextState, "", url);
            } else {
                history.pushState(nextState, "", url);
            }
        }

        _applyScroll(pathname, from, null);
        for (const hook of _afterHooks) {
            try { hook(pathname, from); } catch { /* ignore */ }
        }
    }

    // -------------------------------------------------------------------------
    //  Public navigation API
    // -------------------------------------------------------------------------

    let _pendingPopAnimation: unknown = undefined;

    function navigate(location: RouteLocation, options?: NavigateOptions): void {
        _hasNavigated = true;
        const { pathname, stringQuery } = _resolveLocation(location, options);
        const from = current.value;
        const fromQuery = { ...query.value };
        const m = matchFlat(pathname, flat);

        const nextIntent: NavigationIntent = {
            action: "push",
            direction: options?.direction ?? "forward",
            animation: options?.animation,
        };

        _runGuards(
            pathname,
            from,
            m?.route.beforeEnter,
            () => _commit(pathname, stringQuery, from, fromQuery, m, nextIntent, false),
        );
    }

    function replace(location: RouteLocation, options?: NavigateOptions): void {
        _hasNavigated = true;
        const { pathname, stringQuery } = _resolveLocation(location, options);
        const from = current.value;
        const fromQuery = { ...query.value };
        const m = matchFlat(pathname, flat);

        const nextIntent: NavigationIntent = {
            action: "replace",
            direction: options?.direction ?? "root",
            animation: options?.animation,
        };

        _runGuards(
            pathname,
            from,
            m?.route.beforeEnter,
            () => _commit(pathname, stringQuery, from, fromQuery, m, nextIntent, true),
        );
    }

    function back(animation?: unknown): void {
        if (animation !== undefined) _pendingPopAnimation = animation;
        history.back();
    }

    function forward(animation?: unknown): void {
        if (animation !== undefined) _pendingPopAnimation = animation;
        history.forward();
    }

    function go(delta: number): void { history.go(delta); }

    function isActive(path: string, exact = true): boolean {
        const cur = current.value;
        if (exact) return cur === path;
        return cur === path || cur.startsWith(path.endsWith("/") ? path : path + "/");
    }

    function resolve(path: string): ResolvedRoute {
        const m = matchFlat(path, flat);
        if (!m) return { matched: false, params: {}, route: undefined };
        return { matched: true, params: m.params, route: m.route.record };
    }

    function beforeEach(guard: NavigationGuard): () => void {
        _guards.push(guard);
        return () => {
            const idx = _guards.indexOf(guard);
            if (idx !== -1) _guards.splice(idx, 1);
        };
    }

    function afterEach(hook: AfterEachHook): () => void {
        _afterHooks.push(hook);
        return () => {
            const idx = _afterHooks.indexOf(hook);
            if (idx !== -1) _afterHooks.splice(idx, 1);
        };
    }

    const router: RouterInternal = {
        current, params, query, intent, canGoBack,
        base: _base || "/",
        navigate, replace, back, forward, go,
        isActive, resolve,
        beforeEach, afterEach, routes,
        _flat: flat, _guards, _base, _mode,
    };

    if (_currentRouter) {
        console.warn(
            "[nix-js] A router already exists. The previous router is being replaced. " +
            "Only one router instance should be active at a time.",
        );
    }
    _currentRouter = router;

    queueMicrotask(() => {
        if (_hasNavigated) return;

        const m = matchFlat(initialPath, flat);
        _runGuards(
            initialPath,
            "",
            m?.route.beforeEnter,
            () => { /* allowed */ },
            () => {
                const fallback = "/";
                const url = buildUrl(fallback, {});
                if (_isHashMode) {
                    _hashScrollPositions.set(routeKey(fallback, {}), { left: 0, top: 0 });
                    history.replaceState(history.state, "", url);
                } else {
                    history.replaceState(
                        buildHistoryState({}, { left: 0, top: 0 }, _currentPosition),
                        "",
                        url,
                    );
                }
                const fm = matchFlat(fallback, flat);
                intent.value = { action: "replace", direction: "root" };
                current.value = fallback;
                params.value = fm?.params ?? {};
                query.value = {};
                canGoBack.value = _currentPosition > 0;
                _applyScroll(fallback, initialPath, null);
            },
        );
    });

    return router;
}

export function nixRouter(): Router {
    const injected = inject(RouterKey);
    if (injected) return injected;
    return getRouter();
}

/** @internal */
export function _resetRouter(): void {
    if (_currentPopstateCleanup) {
        _currentPopstateCleanup();
        _currentPopstateCleanup = null;
    }
    _currentRouter = null;
    _mountedRouters.length = 0;
}

export class RouterView extends NixComponent {
    private _depth: number;
    private _router?: RouterInternal;

    constructor(depth = 0, router?: Router) {
        super();
        this._depth = depth;
        this._router = router as RouterInternal | undefined;
    }

    render(): NixTemplate {
        const depth = this._depth;
        const explicitRouter = this._router;
        return html`<div class="router-view">${() => {
            const router = explicitRouter ?? nixRouter() as RouterInternal;
            const matched = matchFlat(router.current.value, router._flat);
            if (!matched) {
                return html`
                    <div style="color:#f87171;padding:16px 0">
                        404 — Route not found: <strong>${router.current.value}</strong>
                    </div>
                `;
            }
            if (depth >= matched.route.chain.length) {
                return html`
                    <span></span>
                `;
            }
            const factory = matched.route.chain[depth];
            // chain entries can be undefined when the route was registered without
            // a `component` (typical when an outlet auto-bootstraps the router).
            // In that case there's nothing to render at this depth.
            if (!factory) return html`
                <span></span>
            `;
            return factory();
        }}</div>`;
    }
}

export class Link extends NixComponent {
    private _to: string;
    private _label: string;
    private _router?: RouterInternal;

    constructor(to: string, label: string, router?: Router) {
        super();
        this._to = to;
        this._label = label;
        this._router = router as RouterInternal | undefined;
    }

    render(): NixTemplate {
        const to = this._to;
        const label = this._label;
        const router = this._router ?? nixRouter() as RouterInternal;
        const appPath = to.startsWith("/") ? to : "/" + to;
        const fullPath = (router._base ? (router._base + appPath) : appPath).replace(/\/+/g, "/");
        const href = router._mode === "hash" ? "#" + fullPath : fullPath;
        return html`
            <a     href=${href}     style=${() => router.current.value === to
                ? "color:#38bdf8;font-weight:700;text-decoration:none;cursor:pointer;padding:4px 10px;border-radius:4px;background:#0c2a3a"
                : "color:#a3a3a3;text-decoration:none;cursor:pointer;padding:4px 10px;border-radius:4px"}     @click=${(e: Event) => { e.preventDefault(); router.navigate(to); }}>${label}</a>
        `;
    }
}

export interface _RouterDebugInternal {
    mode: RouterMode;
    base: string;
    currentPath: string;
    params: Record<string, string>;
    query: Record<string, string>;
    matchedPath: string | null;
    activeGuards: { globalCount: number; hasRouteGuard: boolean; names: string[] };
}

/** @internal Register a router that was injected via mount({ router }). */
export function _debugRegisterRouter(router: Router): void {
    const idx = _mountedRouters.indexOf(router);
    if (idx >= 0) _mountedRouters.splice(idx, 1);
    _mountedRouters.push(router);
}

/** @internal Unregister a router when its mount point is unmounted. */
export function _debugUnregisterRouter(router: Router): void {
    const idx = _mountedRouters.indexOf(router);
    if (idx >= 0) _mountedRouters.splice(idx, 1);
}

export function _debugGetRouterInternal(): _RouterDebugInternal | null {
    // Prefer the most recently mounted injected router over the global singleton
    // so devtools inspect the router actually active in the current UI.
    const router = _mountedRouters.length
        ? _mountedRouters[_mountedRouters.length - 1]
        : _currentRouter;
    if (!router) return null;
    const internal = router as RouterInternal;
    const currentPath = internal.current.value;
    const matched = matchFlat(currentPath, internal._flat);
    const routeGuard = matched?.route.beforeEnter;
    const names = internal._guards.map((g, idx) => g.name || `beforeEach#${idx + 1}`);
    if (routeGuard) names.push(routeGuard.name || "beforeEnter");
    return {
        mode: internal._mode,
        base: internal._base || "/",
        currentPath,
        params: { ...internal.params.value },
        query: { ...internal.query.value },
        matchedPath: matched?.route.fullPath ?? null,
        activeGuards: {
            globalCount: internal._guards.length,
            hasRouteGuard: Boolean(routeGuard),
            names,
        },
    };
}