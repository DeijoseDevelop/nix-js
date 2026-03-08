// src/nix/router.ts — Fase 6: Router History API (pushState)
//                     Fase 20: Route Guards (beforeEach / beforeEnter)

import { signal } from "./reactivity";
import type { Signal } from "./reactivity";
import { NixComponent } from "./lifecycle";
import type { NixTemplate } from "./template";
import { html } from "./template";

// ── Tipos públicos ────────────────────────────────────────────────────────────

/**
 * Value returned (or resolved) by a navigation guard.
 * - `false`  — cancel the navigation.
 * - `string` — redirect to that path.
 * - `void` / `undefined` — allow the navigation.
 */
export type NavigationGuardResult = void | undefined | false | string;

/**
 * A navigation guard function.
 *
 * @param to   Destination pathname (e.g. `"/admin"`).
 * @param from Current pathname before the navigation.
 * @returns `false` to cancel, a path string to redirect, or nothing to allow.
 *          May return a Promise for async guard logic.
 *
 * @example
 * router.beforeEach((to, from) => {
 *   if (!auth.isLoggedIn && to !== "/login") return "/login";
 * });
 */
export type NavigationGuard = (
    to: string,
    from: string,
) => NavigationGuardResult | Promise<NavigationGuardResult>;

export interface RouteRecord {
    /**
     * Segmento de ruta. Soporta:
     *  - Literal:   "/about", "/users"
     *  - Parámetro: "/users/:id", "/posts/:slug/comments/:cid"
     *  - Wildcard:  "*"  (fallback global o de prefijo con children)
     *
     * Los paths de children se concatenan con el del padre.
     *
     * @example
     * { path: "/users/:id", component: UserDetail }
     * // Navegar a "/users/42" → params.value = { id: "42" }
     *
     * @example
     * { path: "/dash", component: DashLayout, children: [
     *   { path: "/users",   component: UsersPage },
     * ]}
     * // Genera las rutas planas: /dash, /dash/users
     */
    path: string;
    /** Factory que devuelve la vista a renderizar en este nivel */
    component: () => NixTemplate | NixComponent;
    /**
     * Rutas hijas. Sus paths se unen con el del padre.
     * El componente padre debe incluir `new RouterView(1)` para renderizarlas.
     */
    children?: RouteRecord[];
    /**
     * Guard de nivel de ruta. Se ejecuta solo al entrar en esta ruta concreta.
     * Misma semántica de retorno que `beforeEach`.
     *
     * @example
     * { path: "/admin", component: () => new AdminPage(),
     *   beforeEnter: (to, from) => {
     *     if (!isAdmin) return "/";
     *   }}
     */
    beforeEnter?: NavigationGuard;
}

export interface Router {
    /** Señal con la ruta activa actual (pathname, p.ej. "/users/42") */
    readonly current: Signal<string>;
    /**
     * Señal con los parámetros dinámicos de la ruta activa (:id, :slug…).
     * Se actualiza síncronamente con cada `navigate()`.
     *
     * @example
     * // Ruta: "/users/:id"  →  navigate("/users/42")
     * router.params.value  // { id: "42" }
     */
    readonly params: Signal<Record<string, string>>;
    /**
     * Señal con los query params de la URL (?clave=valor…).
     * Se actualiza síncronamente con cada `navigate()`.
     *
     * @example
     * router.navigate("/users?page=2&sort=name")
     * router.query.value  // { page: "2", sort: "name" }
     *
     * @example
     * router.navigate("/users", { page: 2, sort: "name" })
     * router.query.value  // { page: "2", sort: "name" }
     */
    readonly query: Signal<Record<string, string>>;
    /**
     * Navegar a una ruta nueva (pushState + actualiza señales).
     * Si hay guards registrados, la navegación espera a que todos pasen.
     *
     * @param path     Ruta destino. Puede incluir query string: "/users?page=2"
     * @param query    Query params como objeto. Se mezclan con los del path.
     *                 Un valor `null`/`undefined` elimina el parámetro.
     */
    navigate(path: string, query?: Record<string, string | number | boolean | null | undefined>): void;
    /** Árbol de rutas original (tal como se pasó a createRouter) */
    readonly routes: RouteRecord[];
    /**
     * Registra un guard de navegación global.
     * Se ejecuta (en orden de registro) antes de cada navegación.
     *
     * Retorna una función para eliminar el guard.
     *
     * @example
     * const stop = router.beforeEach((to, from) => {
     *   if (!auth && to !== "/login") return "/login";
     * });
     * stop(); // elimina el guard
     */
    beforeEach(guard: NavigationGuard): () => void;
}

// ── Internos ──────────────────────────────────────────────────────────────────

/** Un segmento de la ruta parseado */
type Segment =
    | { kind: "literal"; value: string }
    | { kind: "param"; name: string }
    | { kind: "wildcard" };

interface FlatRoute {
    fullPath: string;
    segments: Segment[];
    /** [componentePadre, componenteHijo, …] */
    chain: Array<() => NixTemplate | NixComponent>;
    /** Guard de entrada de esta ruta concreta (del RouteRecord hoja) */
    beforeEnter?: NavigationGuard;
}

interface RouterInternal extends Router {
    _flat: FlatRoute[];
    _guards: NavigationGuard[];
}

/** Singleton de módulo — la última instancia creada con createRouter() */
let _currentRouter: RouterInternal | null = null;
/** Cleanup function for the current router's popstate listener. */
let _currentPopstateCleanup: (() => void) | null = null;

function getRouter(): RouterInternal {
    if (!_currentRouter) {
        throw new Error("[Nix] No hay router activo. Llama a createRouter() antes.");
    }
    return _currentRouter;
}

// ── Helpers internos ──────────────────────────────────────────────────────────
/** Convierte `window.location.search` (o cualquier string `?k=v`) en objeto */
function parseQuery(search: string): Record<string, string> {
    const result: Record<string, string> = {};
    new URLSearchParams(search).forEach((v, k) => { result[k] = v; });
    return result;
}

/**
 * Construye un query string a partir de un objeto.
 * Valores `null`/`undefined`/`false` se omiten.
 * Devuelve `""` si no hay claves, `"?k=v&..."` en caso contrario.
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
/** Parsea un fullPath ya unido en sus segmentos */
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

/** Une un path padre con un segmento hijo normalizando barras dobles */
function joinPaths(parent: string, child: string): string {
    if (child === "*") return parent === "" ? "*" : parent + "/*";
    const segment = child.startsWith("/") ? child : "/" + child;
    return (parent + segment).replace(/\/+/g, "/") || "/";
}

/** Convierte el árbol de RouteRecord en una lista plana con cadena de componentes */
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

/**
 * Intenta hacer match de `path` contra una `FlatRoute`.
 * Devuelve los params extraídos si hay coincidencia, o `null` si no.
 */
function tryMatch(path: string, route: FlatRoute): Record<string, string> | null {
    const parts = path.split("/").filter(Boolean);
    const segs = route.segments;

    // Wildcard global ("*") — coincide con todo
    if (segs.length === 1 && segs[0].kind === "wildcard") return {};

    // Wildcard de prefijo — el último segmento es "/*"
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

/**
 * Especificidad de una ruta: más literales = más específica.
 * literal=2, param=1, wildcard=0 — mayor puntaje gana.
 */
function specificity(route: FlatRoute): number {
    return route.segments.reduce((acc, seg) => {
        if (seg.kind === "literal") return acc + 2;
        if (seg.kind === "param") return acc + 1;
        return acc;
    }, 0);
}

/** Encuentra la mejor ruta para el path dado junto con los params extraídos */
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

// ── createRouter ──────────────────────────────────────────────────────────────

/**
 * Crea el router History API y lo establece como singleton activo del módulo.
 * Usa `history.pushState` — URLs limpias sin `#`.
 * `RouterView` y `Link` lo consumen automáticamente — no necesitan que se los pases.
 *
 * @note En producción el servidor debe responder con `index.html` para cualquier
 * ruta no-archivo. Vite dev y `vite preview` lo hacen automáticamente.
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

    // ── Guards ────────────────────────────────────────────────────────────────
    const _guards: NavigationGuard[] = [];
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

    // ── Helpers internos de navegación ────────────────────────────────────────
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

    // ── Botón atrás/adelante del navegador ────────────────────────────────────
    // Clean up any previous router's popstate listener
    if (_currentPopstateCleanup) {
        _currentPopstateCleanup();
        _currentPopstateCleanup = null;
    }

    const onPopstate = () => {
        const p = getPathname();
        const from = current.value;
        const fromQuery = query.value;   // para restaurar la URL si se cancela
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
            },
            () => {
                // Guard canceló el popstate: restaurar URL anterior sin disparar otro popstate
                history.pushState(null, "", from + buildQueryString(fromQuery));
            },
        );
    };

    window.addEventListener("popstate", onPopstate);
    _currentPopstateCleanup = () => window.removeEventListener("popstate", onPopstate);

    // ── navigate ──────────────────────────────────────────────────────────────
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
            () => {
                params.value = m?.params ?? {};
                query.value = stringQuery;
                current.value = pathname;
                history.pushState(null, "", pathname + buildQueryString(stringQuery));
            },
        );
    }

    // ── beforeEach ────────────────────────────────────────────────────────────
    function beforeEach(guard: NavigationGuard): () => void {
        _guards.push(guard);
        return () => {
            const idx = _guards.indexOf(guard);
            if (idx !== -1) _guards.splice(idx, 1);
        };
    }

    const router: RouterInternal = { current, params, query, navigate, beforeEach, routes, _flat: flat, _guards };
    _currentRouter = router;

    // ── Initial navigation guard check ────────────────────────────────────────
    // Guards are registered with beforeEach() / beforeEnter after createRouter()
    // returns, so we defer the initial check to a microtask — by then all guards
    // are in place and the initial path is validated exactly like any navigation.
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

/**
 * Devuelve el router activo (singleton).
 * Útil dentro de componentes para acceder a `params` y `current` sin prop-drilling.
 *
 * @example
 * class UserDetail extends NixComponent {
 *   render() {
 *     return html`<div>User: ${() => useRouter().params.value.id}</div>`;
 *   }
 * }
 */
export function useRouter(): Router {
    return getRouter();
}

// ── RouterView ────────────────────────────────────────────────────────────────

/**
 * Renderiza el componente de la ruta activa en el nivel `depth`.
 *
 * - `new RouterView()`  → nivel raíz (depth 0).
 * - `new RouterView(1)` → primer nivel de rutas anidadas. Úsalo dentro del
 *   componente padre para que renderice el hijo correspondiente.
 *
 * Consume el router singleton — no requiere que se le pase el router.
 */
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
          404 — Ruta no encontrada: <strong>${router.current.value}</strong>
        </div>`;
            }

            if (depth >= matched.route.chain.length) {
                // No hay componente registrado en este nivel de anidamiento
                return html`<span></span>`;
            }

            return matched.route.chain[depth]();
        }}</div>`;
    }
}

// ── Link ──────────────────────────────────────────────────────────────────────

/**
 * Enlace de navegación reactivo que se estiliza como activo/inactivo según la
 * ruta actual. Consume el router singleton — no requiere que se le pase.
 *
 * @example
 * new Link("/about", "About")
 */
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
        const href = to; // History API — sin prefijo "#"
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
