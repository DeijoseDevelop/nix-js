// src/nix/router.ts — Fase 6: Router History API (pushState)

import { signal } from "./reactivity";
import type { Signal } from "./reactivity";
import { NixComponent } from "./lifecycle";
import type { NixTemplate } from "./template";
import { html } from "./template";

// ── Tipos públicos ────────────────────────────────────────────────────────────

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
     * Navegar a una ruta nueva (pushState + actualiza señales síncronamente).
     *
     * @param path     Ruta destino. Puede incluir query string: "/users?page=2"
     * @param query    Query params como objeto. Se mezclan con los del path.
     *                 Un valor `null`/`undefined` elimina el parámetro.
     */
    navigate(path: string, query?: Record<string, string | number | boolean | null | undefined>): void;
    /** Árbol de rutas original (tal como se pasó a createRouter) */
    readonly routes: RouteRecord[];
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
}

interface RouterInternal extends Router {
    _flat: FlatRoute[];
}

/** Singleton de módulo — la última instancia creada con createRouter() */
let _currentRouter: RouterInternal | null = null;

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
        result.push({ fullPath, segments, chain });
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
            params[seg.name] = decodeURIComponent(parts[i] ?? "");
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

    // Botón atrás/adelante del navegador
    window.addEventListener("popstate", () => {
        const p = getPathname();
        const m = matchFlat(p, flat);
        params.value = m?.params ?? {};
        query.value = parseQuery(window.location.search);
        current.value = p;
    });

    function navigate(
        path: string,
        queryObj?: Record<string, string | number | boolean | null | undefined>
    ): void {
        // Separar pathname del query string incrustado en el path
        const qIdx = path.indexOf("?");
        const pathname = qIdx === -1 ? path : path.slice(0, qIdx);
        const inlineQ = qIdx === -1 ? {} : parseQuery(path.slice(qIdx));

        // El queryObj tiene precedencia sobre el inline
        const finalQuery = queryObj ? { ...inlineQ, ...queryObj } : inlineQ;

        // Convertir todos los valores a string (omitir null/undefined/false)
        const stringQuery: Record<string, string> = {};
        for (const [k, v] of Object.entries(finalQuery)) {
            if (v != null && v !== false) stringQuery[k] = String(v);
        }

        const m = matchFlat(pathname, flat);
        params.value = m?.params ?? {};
        query.value = stringQuery;
        current.value = pathname;

        const fullUrl = pathname + buildQueryString(stringQuery);
        history.pushState(null, "", fullUrl);        // cambia URL sin recargar página
    }

    const router: RouterInternal = { current, params, query, navigate, routes, _flat: flat };
    _currentRouter = router;
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
