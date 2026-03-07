// src/nix/async.ts — Fase 8: Lazy loading + Suspense

import { signal } from "./reactivity";
import { NixComponent } from "./lifecycle";
import type { NixTemplate } from "./template";
import { html } from "./template";

// ── Tipos públicos ────────────────────────────────────────────────────────────

type AsyncState<T> =
    | { status: "pending" }
    | { status: "resolved"; data: T }
    | { status: "error"; error: unknown };

export interface SuspenseOptions {
    /**
     * Template a mostrar mientras la promesa está pendiente.
     * Por defecto: spinner de puntos animados.
     */
    fallback?: NixTemplate;
    /**
     * Factory que recibe el error y devuelve el template de error.
     * Por defecto: mensaje de error en rojo.
     */
    errorFallback?: (err: unknown) => NixTemplate;
    /**
     * Si `true`, mantiene el fallback visible mientras `asyncFn` vuelve a
     * ejecutarse tras un cambio reactivo. Si `false` (por defecto), durante
     * las recargas se sigue mostrando el contenido anterior hasta que la nueva
     * promesa se resuelva.
     */
    resetOnRefresh?: boolean;
}

// ── suspend() ─────────────────────────────────────────────────────────────────

/**
 * Ejecuta una función async y renderiza según su estado (pending / resolved /
 * error). Equivale al patrón <Suspense> de otros frameworks.
 *
 * @param asyncFn   Función que devuelve una promesa con los datos.
 * @param renderFn  Recibe los datos resueltos y devuelve el template/componente.
 * @param options   `fallback`, `errorFallback`, `resetOnRefresh`.
 *
 * @example
 * // Uso simple con fallback por defecto
 * const userView = suspend(
 *   () => fetchUser(userId.value),
 *   user => html`<div>${user.name}</div>`
 * );
 *
 * @example
 * // Con fallback personalizado y manejo de error
 * suspend(
 *   () => api.getItems(),
 *   items => html`<ul>${items.map(i => html`<li>${i}</li>`)}</ul>`,
 *   {
 *     fallback: html`<span>Cargando items…</span>`,
 *     errorFallback: err => html`<p style="color:red">Error: ${String(err)}</p>`,
 *   }
 * )
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
            Cargando…
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
            if (resetOnRefresh || this._state.value.status === "pending") {
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

// ── lazy() ────────────────────────────────────────────────────────────────────

/**
 * Envuelve un import dinámico para lazy loading de componentes de ruta.
 * El módulo se carga una sola vez (cacheado) y mientras tanto muestra el
 * fallback. Compatible directamente con el campo `component` de `RouteRecord`.
 *
 * El módulo importado debe exportar el componente como **export default**.
 *
 * @param importFn  Función que hace el import dinámico.
 * @param fallback  Template opcional mientras se descarga el chunk.
 *
 * @example
 * createRouter([
 *   { path: "/",      component: lazy(() => import("./pages/Home"))    },
 *   { path: "/about", component: lazy(() => import("./pages/About"))   },
 *   { path: "/admin", component: lazy(() => import("./pages/Admin"),
 *       html`<p>Cargando panel…</p>`) },
 * ])
 */
export function lazy(
    importFn: () => Promise<{ default: new () => NixComponent }>,
    fallback?: NixTemplate
): () => NixComponent {
    // Cache del constructor — null mientras no se haya cargado
    let Cached: (new () => NixComponent) | null = null;

    return (): NixComponent => {
        // Si ya está cargado, instanciar directamente (sin Suspense)
        if (Cached) return new Cached();

        // Primera vez: cargar el chunk y cachear
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
