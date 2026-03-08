import { signal } from "./reactivity";
import type { Signal } from "./reactivity";
import { NixComponent } from "./lifecycle";
import type { NixTemplate } from "./template";
import { html } from "./template";

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
    /** Route path segment. Supports literals, params (`:id`), and wildcards (`*`). */
    path: string;
    /** Factory returning the view for this route level. */
    component: () => NixTemplate | NixComponent;
    /** Child routes. Paths are joined with the parent. */
    children?: RouteRecord[];
    /** Route-level guard. Runs only when entering this specific route. */
    beforeEnter?: NavigationGuard;
}

/**
 * Callback for `afterEach` hooks — receives the committed `to` and `from` paths.
 */
export type AfterEachHook = (to: string, from: string) => void;

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

export interface Router {
    /** Signal with the current active pathname. */
    readonly current: Signal<string>;
    /** Signal with the extracted dynamic route params. */
    readonly params: Signal<Record<string, string>>;
    /** Signal with the URL query params. */
    readonly query: Signal<Record<string, string>>;
    /** Navigate to a new path via `pushState`. Guards run before committing. */
    navigate(path: string, query?: Record<string, string | number | boolean | null | undefined>): void;
    /** Navigate via `replaceState` (no new history entry). Guards still run. */
    replace(path: string, query?: Record<string, string | number | boolean | null | undefined>): void;
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

// --- Internals ---

type Segment =
    | { kind: "literal"; value: string }
    | { kind: "param"; name: string }
    | { kind: "wildcard" };

interface FlatRoute {
    fullPath: string;
    segments: Segment[];
    chain: Array<() => NixTemplate | NixComponent>;
    beforeEnter?: NavigationGuard;
}

interface RouterInternal extends Router {
    _flat: FlatRoute[];
    _guards: NavigationGuard[];
}

/** Module-level singleton — the last router created with `createRouter()`. */
let _currentRouter: RouterInternal | null = null;
/** Cleanup function for the current router's popstate listener. */
let _currentPopstateCleanup: (() => void) | null = null;

function getRouter(): RouterInternal {
    if (!_currentRouter) {
        throw new Error("[Nix] No active router. Call createRouter() first.");
    }
    return _currentRouter;
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
        result.push({ fullPath, segments, chain, beforeEnter: route.beforeEnter });
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

// --- createRouter ---

/**
 * Creates the History API router and sets it as the active singleton.
 * In production the server must serve `index.html` for all non-file routes.
 */
export function createRouter(routes: RouteRecord[]): Router {
    function getPathname(): string {
        return window.location.pathname || "/";
    }

    const initialPath = getPathname();
    const flat = flattenRoutes(routes);
    const initialMatch = matchFlat(initialPath, flat);

    const current = signal(initialPath);
    const params = signal<Record<string, string>>(initialMatch?.params ?? {});
    const query = signal<Record<string, string>>(parseQuery(window.location.search));

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
        const pathname = qIdx === -1 ? path : path.slice(0, qIdx);
        const inlineQ = qIdx === -1 ? {} : parseQuery(path.slice(qIdx));
        const finalQuery = queryObj ? { ...inlineQ, ...queryObj } : inlineQ;
        const stringQuery: Record<string, string> = {};
        for (const [k, v] of Object.entries(finalQuery)) {
            if (v != null && v !== false) stringQuery[k] = String(v);
        }
        return { pathname, stringQuery };
    }

    // --- Popstate handler ---
    // Clean up any previous router's popstate listener
    if (_currentPopstateCleanup) {
        _currentPopstateCleanup();
        _currentPopstateCleanup = null;
    }

    const onPopstate = () => {
        const p = getPathname();
        const from = current.value;
        const fromQuery = query.value;   // used to restore URL if guard cancels
        const m = matchFlat(p, flat);
        const newQuery = parseQuery(window.location.search);

        _runGuards(
            p,
            from,
            m?.route.beforeEnter,
            () => {
                params.value = m?.params ?? {};
                query.value = newQuery;
                current.value = p;
                // Fire afterEach hooks for popstate navigations
                for (const hook of _afterHooks) {
                    try { hook(p, from); } catch { /* ignore */ }
                }
            },
            () => {
                // Guard cancelled popstate: restore previous URL without triggering another popstate
                history.pushState(null, "", from + buildQueryString(fromQuery));
            },
        );
    };

    window.addEventListener("popstate", onPopstate);
    _currentPopstateCleanup = () => window.removeEventListener("popstate", onPopstate);

    // --- Internal: commit navigation + fire afterEach hooks ---
    function _commit(
        pathname: string,
        stringQuery: Record<string, string>,
        from: string,
        m: ReturnType<typeof matchFlat>,
        useReplace: boolean,
    ): void {
        params.value = m?.params ?? {};
        query.value = stringQuery;
        current.value = pathname;
        const url = pathname + buildQueryString(stringQuery);
        if (useReplace) {
            history.replaceState(null, "", url);
        } else {
            history.pushState(null, "", url);
        }
        // Fire afterEach hooks
        for (const hook of _afterHooks) {
            try { hook(pathname, from); } catch { /* ignore */ }
        }
    }

    // --- navigate ---
    function navigate(
        path: string,
        queryObj?: Record<string, string | number | boolean | null | undefined>,
    ): void {
        _hasNavigated = true;
        const { pathname, stringQuery } = _parsePath(path, queryObj);
        const from = current.value;
        const m = matchFlat(pathname, flat);

        _runGuards(
            pathname,
            from,
            m?.route.beforeEnter,
            () => _commit(pathname, stringQuery, from, m, false),
        );
    }

    // --- replace ---
    function replace(
        path: string,
        queryObj?: Record<string, string | number | boolean | null | undefined>,
    ): void {
        _hasNavigated = true;
        const { pathname, stringQuery } = _parsePath(path, queryObj);
        const from = current.value;
        const m = matchFlat(pathname, flat);

        _runGuards(
            pathname,
            from,
            m?.route.beforeEnter,
            () => _commit(pathname, stringQuery, from, m, true),
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
        // Find the original RouteRecord that corresponds to this match
        const leafComponent = m.route.chain[m.route.chain.length - 1];
        function findRecord(records: RouteRecord[]): RouteRecord | undefined {
            for (const r of records) {
                if (r.component === leafComponent) return r;
                if (r.children) {
                    const found = findRecord(r.children);
                    if (found) return found;
                }
            }
            return undefined;
        }
        return { matched: true, params: m.params, route: findRecord(routes) };
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
        current, params, query, navigate, replace,
        back, forward, go, isActive, resolve,
        beforeEach, afterEach, routes, _flat: flat, _guards,
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
                history.replaceState(null, "", fallback);
                const fm = matchFlat(fallback, flat);
                current.value = fallback;
                params.value = fm?.params ?? {};
                query.value = {};
            },
        );
    });

    return router;
}

/** Returns the active router singleton. */
export function useRouter(): Router {
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
            const router = getRouter();
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
        const href = to;
        return html`<a
      href=${href}
      style=${() => {
                const router = getRouter();
                return router.current.value === to
                    ? "color:#38bdf8;font-weight:700;text-decoration:none;cursor:pointer;padding:4px 10px;border-radius:4px;background:#0c2a3a"
                    : "color:#a3a3a3;text-decoration:none;cursor:pointer;padding:4px 10px;border-radius:4px";
            }}
      @click=${(e: Event) => {
                e.preventDefault();
                getRouter().navigate(to);
            }}
    >${label}</a>`;
    }
}
