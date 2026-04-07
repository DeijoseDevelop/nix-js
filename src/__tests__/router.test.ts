import { describe, it, expect, vi, beforeEach } from "vitest";
import { html } from "../nix/template";
import { createRouter, useRouter, RouterView, Link, _resetRouter } from "../nix/router";
import type { NavigationGuard } from "../nix/router";

// Reset router singleton before each test to avoid warnings
beforeEach(() => { _resetRouter(); });

// ── createRouter ──────────────────────────────────────────────────────────────

describe("createRouter", () => {
    it("initializes with current pathname", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
        ]);
        expect(r.current.value).toBe(window.location.pathname);
    });

    it("navigate updates current signal", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        r.navigate("/about");
        expect(r.current.value).toBe("/about");
    });

    it("extracts dynamic params from :param paths", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/user/:id", component: () => html`<p>user</p>` },
        ]);
        r.navigate("/user/42");
        expect(r.params.value).toEqual({ id: "42" });
    });

    it("parses query strings", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/search", component: () => html`<p>search</p>` },
        ]);
        r.navigate("/search?q=hello&page=1");
        expect(r.query.value).toEqual({ q: "hello", page: "1" });
    });

    it("navigate with query object", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/search", component: () => html`<p>search</p>` },
        ]);
        r.navigate("/search", { q: "test", page: 2 });
        expect(r.query.value.q).toBe("test");
        expect(r.query.value.page).toBe("2");
    });

    it("nested routes construct full paths", () => {
        const r = createRouter([
            {
                path: "/dashboard",
                component: () => html`<div>dashboard</div>`,
                children: [
                    { path: "/stats", component: () => html`<p>stats</p>` },
                ],
            },
        ]);
        r.navigate("/dashboard/stats");
        expect(r.current.value).toBe("/dashboard/stats");
    });

    it("wildcard route matches any path", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "*", component: () => html`<p>404</p>` },
        ]);
        r.navigate("/nonexistent");
        expect(r.current.value).toBe("/nonexistent");
    });
});

// ── useRouter ─────────────────────────────────────────────────────────────────

describe("useRouter", () => {
    it("returns the active router singleton", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
        ]);
        expect(useRouter()).toBe(r);
    });
});

// ── Route Guards ──────────────────────────────────────────────────────────────

describe("route guards", () => {
    it("beforeEach fires on navigate", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        let fired = false;
        r.beforeEach(() => { fired = true; });
        r.navigate("/about");
        expect(fired).toBe(true);
    });

    it("beforeEach returning false cancels navigation", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        const beforePath = r.current.value;
        r.beforeEach(() => false);
        r.navigate("/about");
        expect(r.current.value).toBe(beforePath);
    });

    it("beforeEach returning string redirects", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/admin", component: () => html`<p>admin</p>` },
            { path: "/login", component: () => html`<p>login</p>` },
        ]);
        r.beforeEach((to) => {
            if (to === "/admin") return "/login";
        });
        r.navigate("/admin");
        expect(r.current.value).toBe("/login");
    });

    it("beforeEach receives correct to/from", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        let capturedTo = "", capturedFrom = "";
        r.beforeEach((to, from) => { capturedTo = to; capturedFrom = from; });
        const from = r.current.value;
        r.navigate("/about");
        expect(capturedTo).toBe("/about");
        expect(capturedFrom).toBe(from);
    });

    it("beforeEnter fires only for its route", () => {
        let fired = false;
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
            {
                path: "/admin", component: () => html`<p>admin</p>`,
                beforeEnter: (() => { fired = true; }) as NavigationGuard,
            },
        ]);
        r.navigate("/about");
        expect(fired).toBe(false);
        r.navigate("/admin");
        expect(fired).toBe(true);
    });

    it("beforeEnter returning false blocks navigation", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            {
                path: "/secret", component: () => html`<p>secret</p>`,
                beforeEnter: (() => false) as NavigationGuard,
            },
        ]);
        const beforePath = r.current.value;
        r.navigate("/secret");
        expect(r.current.value).toBe(beforePath);
    });

    it("multiple guards run in registration order", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        const order: number[] = [];
        r.beforeEach(() => { order.push(1); });
        r.beforeEach(() => { order.push(2); });
        r.beforeEach(() => { order.push(3); });
        r.navigate("/about");
        expect(order).toEqual([1, 2, 3]);
    });

    it("unsubscribe removes the guard", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/a", component: () => html`<p>a</p>` },
            { path: "/b", component: () => html`<p>b</p>` },
        ]);
        let count = 0;
        const stop = r.beforeEach(() => { count++; });
        r.navigate("/a");
        expect(count).toBe(1);
        stop();
        r.navigate("/b");
        expect(count).toBe(1);
    });

    it("guard returning false short-circuits remaining guards", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        let secondFired = false;
        r.beforeEach(() => false);
        r.beforeEach(() => { secondFired = true; });
        r.navigate("/about");
        expect(secondFired).toBe(false);
    });

    it("beforeEach guard runs on initial load (direct URL access)", async () => {
        history.pushState(null, "", "/admin");
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/admin", component: () => html`<p>admin</p>` },
            { path: "/login", component: () => html`<p>login</p>` },
        ]);
        // Guard registered after createRouter — mirrors real app setup
        r.beforeEach((to) => {
            if (to === "/admin") return "/login";
        });
        // Wait for the initial-check microtask to fire
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        expect(r.current.value).toBe("/login");
        history.replaceState(null, "", "/");
    });

    it("beforeEnter guard blocks initial direct access", async () => {
        history.pushState(null, "", "/secret");
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            {
                path: "/secret",
                component: () => html`<p>secret</p>`,
                beforeEnter: (() => false) as NavigationGuard,
            },
        ]);
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        expect(r.current.value).toBe("/");
        history.replaceState(null, "", "/");
    });

    it("allowed initial route stays unchanged", async () => {
        history.pushState(null, "", "/about");
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        r.beforeEach(() => { /* allow all */ });
        await new Promise<void>((resolve) => queueMicrotask(resolve));
        expect(r.current.value).toBe("/about");
        history.replaceState(null, "", "/");
    });
});

// ── RouterView ────────────────────────────────────────────────────────────────

describe("RouterView", () => {
    it("renders the matched route component", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p class="rv-home">Home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        // Navigate to "/" explicitly so current matches the route
        r.navigate("/");
        const el = document.createElement("div");
        document.body.appendChild(el);
        html`<div>${new RouterView()}</div>`.mount(el);
        expect(el.querySelector(".rv-home")).not.toBeNull();
        document.body.removeChild(el);
    });
});

// ── Security fixes ────────────────────────────────────────────────────────────

describe("security: malformed URI params", () => {
    it("does not crash on malformed percent-encoding in route params", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/user/:id", component: () => html`<p>user</p>` },
        ]);
        // "%ZZ" is invalid percent-encoding — should not throw
        expect(() => r.navigate("/user/%ZZ")).not.toThrow();
        expect(r.params.value.id).toBe("%ZZ"); // falls back to raw segment
    });
});

describe("security: async guard race condition", () => {
    it("abandons stale async guard when a new navigation starts", async () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/a", component: () => html`<p>a</p>` },
            { path: "/b", component: () => html`<p>b</p>` },
        ]);
        r.navigate("/");

        // Slow async guard that allows after 50ms
        r.beforeEach(() => new Promise<void>((res) => setTimeout(res, 50)));

        // Start navigation to /a (async guard pending)
        r.navigate("/a");
        // Immediately start navigation to /b (should cancel /a's chain)
        r.navigate("/b");

        // Wait for all guards to resolve
        await new Promise((res) => setTimeout(res, 150));

        // Only the LAST navigation (/b) should have committed
        expect(r.current.value).toBe("/b");
    });
});

describe("security: router replacement warning", () => {
    it("warns when creating a second router", () => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => { });
        createRouter([
            { path: "/", component: () => html`<p>first</p>` },
        ]);
        // Second router should trigger warning
        createRouter([
            { path: "/", component: () => html`<p>second</p>` },
        ]);
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining("A router already exists")
        );
        warnSpy.mockRestore();
    });
});

// ── replace() ─────────────────────────────────────────────────────────────────

describe("replace()", () => {
    it("updates current signal without pushState", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/login", component: () => html`<p>login</p>` },
            { path: "/home", component: () => html`<p>home2</p>` },
        ]);
        r.navigate("/login");
        const lenAfterNav = history.length;
        r.replace("/home");
        expect(r.current.value).toBe("/home");
        // replaceState does not increase history length
        expect(history.length).toBe(lenAfterNav);
    });

    it("runs guards before replacing", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/a", component: () => html`<p>a</p>` },
        ]);
        r.beforeEach(() => false);
        const before = r.current.value;
        r.replace("/a");
        expect(r.current.value).toBe(before);
    });

    it("parses query params", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/search", component: () => html`<p>search</p>` },
        ]);
        r.replace("/search", { q: "hello" });
        expect(r.query.value).toEqual({ q: "hello" });
    });

    it("extracts dynamic params", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/user/:id", component: () => html`<p>user</p>` },
        ]);
        r.replace("/user/99");
        expect(r.params.value).toEqual({ id: "99" });
    });
});

// ── back() / forward() / go() ────────────────────────────────────────────────

describe("back() / forward() / go()", () => {
    it("back() calls history.back", () => {
        const spy = vi.spyOn(history, "back").mockImplementation(() => { });
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
        ]);
        r.back();
        expect(spy).toHaveBeenCalledOnce();
        spy.mockRestore();
    });

    it("forward() calls history.forward", () => {
        const spy = vi.spyOn(history, "forward").mockImplementation(() => { });
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
        ]);
        r.forward();
        expect(spy).toHaveBeenCalledOnce();
        spy.mockRestore();
    });

    it("go(n) calls history.go with the correct delta", () => {
        const spy = vi.spyOn(history, "go").mockImplementation(() => { });
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
        ]);
        r.go(-2);
        expect(spy).toHaveBeenCalledWith(-2);
        r.go(3);
        expect(spy).toHaveBeenCalledWith(3);
        spy.mockRestore();
    });
});

// ── isActive() ────────────────────────────────────────────────────────────────

describe("isActive()", () => {
    it("returns true for exact match (default)", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        r.navigate("/about");
        expect(r.isActive("/about")).toBe(true);
        expect(r.isActive("/")).toBe(false);
    });

    it("exact match is strict (no prefix)", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/admin/users", component: () => html`<p>users</p>` },
        ]);
        r.navigate("/admin/users");
        expect(r.isActive("/admin")).toBe(false);
        expect(r.isActive("/admin/users")).toBe(true);
    });

    it("prefix match with exact=false", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/admin/users", component: () => html`<p>users</p>` },
        ]);
        r.navigate("/admin/users");
        expect(r.isActive("/admin", false)).toBe(true);
        expect(r.isActive("/admin/users", false)).toBe(true);
        expect(r.isActive("/other", false)).toBe(false);
    });
});

// ── resolve() ─────────────────────────────────────────────────────────────────

describe("resolve()", () => {
    it("returns matched=true with params for known routes", () => {
        const userComp = () => html`<p>user</p>`;
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/user/:id", component: userComp },
        ]);
        const info = r.resolve("/user/7");
        expect(info.matched).toBe(true);
        expect(info.params).toEqual({ id: "7" });
        expect(info.route).toBeDefined();
        expect(info.route!.path).toBe("/user/:id");
    });

    it("returns matched=false for unknown paths", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
        ]);
        const info = r.resolve("/nonexistent");
        expect(info.matched).toBe(false);
        expect(info.params).toEqual({});
        expect(info.route).toBeUndefined();
    });

    it("does not change current route", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        r.navigate("/");
        const before = r.current.value;
        r.resolve("/about");
        expect(r.current.value).toBe(before);
    });
});

// ── afterEach() ───────────────────────────────────────────────────────────────

describe("afterEach()", () => {
    it("fires after navigate()", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/about", component: () => html`<p>about</p>` },
        ]);
        r.navigate("/");
        const calls: [string, string][] = [];
        r.afterEach((to, from) => calls.push([to, from]));
        r.navigate("/about");
        expect(calls).toEqual([["/about", "/"]]);
    });

    it("fires after replace()", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/a", component: () => html`<p>a</p>` },
        ]);
        r.navigate("/");
        const calls: [string, string][] = [];
        r.afterEach((to, from) => calls.push([to, from]));
        r.replace("/a");
        expect(calls).toEqual([["/a", "/"]]);
    });

    it("does NOT fire when guard cancels navigation", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/a", component: () => html`<p>a</p>` },
        ]);
        r.navigate("/");
        r.beforeEach(() => false);
        let fired = false;
        r.afterEach(() => { fired = true; });
        r.navigate("/a");
        expect(fired).toBe(false);
    });

    it("unsubscribe removes the hook", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/a", component: () => html`<p>a</p>` },
            { path: "/b", component: () => html`<p>b</p>` },
        ]);
        r.navigate("/");
        let count = 0;
        const stop = r.afterEach(() => { count++; });
        r.navigate("/a");
        expect(count).toBe(1);
        stop();
        r.navigate("/b");
        expect(count).toBe(1);
    });

    it("multiple afterEach hooks run in order", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/a", component: () => html`<p>a</p>` },
        ]);
        r.navigate("/");
        const order: number[] = [];
        r.afterEach(() => order.push(1));
        r.afterEach(() => order.push(2));
        r.afterEach(() => order.push(3));
        r.navigate("/a");
        expect(order).toEqual([1, 2, 3]);
    });

    it("afterEach exceptions are swallowed", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/a", component: () => html`<p>a</p>` },
        ]);
        r.navigate("/");
        let secondCalled = false;
        r.afterEach(() => { throw new Error("boom"); });
        r.afterEach(() => { secondCalled = true; });
        expect(() => r.navigate("/a")).not.toThrow();
        expect(secondCalled).toBe(true);
    });
});

// ── Router Options (Base Path) ────────────────────────────────────────────────

describe("Base path options", () => {
    it("respects explicit base option and prepends it to pushState", () => {
        const r = createRouter(
            [{ path: "/", component: () => html`<p>home</p>` }, { path: "/test", component: () => html`<p>test</p>` }],
            { base: "/my-app" }
        );
        expect(r.base).toBe("/my-app");

        const pushStateSpy = vi.spyOn(history, "pushState").mockImplementation(() => { });
        r.navigate("/test");
        expect(pushStateSpy).toHaveBeenCalledWith(null, "", "/my-app/test");
        pushStateSpy.mockRestore();
    });

    it("auto-detects base from document <base> tag", () => {
        const baseEl = document.createElement("base");
        baseEl.href = "/auto-base/";
        document.head.appendChild(baseEl);

        const r = createRouter([{ path: "/", component: () => html`<p>home</p>` }]);
        expect(r.base).toBe("/auto-base");

        document.head.removeChild(baseEl);
    });
});

// ── useRouter Errors ──────────────────────────────────────────────────────────

describe("useRouter errors", () => {
    it("throws if called before createRouter", () => {
        _resetRouter();
        expect(() => useRouter()).toThrow(/No active router/);
    });
});

// ── RouterView Edge Cases ─────────────────────────────────────────────────────

describe("RouterView edge cases", () => {
    it("renders 404 block if no route is matched", () => {
        const r = createRouter([]);
        r.navigate("/unknown");

        const el = document.createElement("div");
        html`<div>${new RouterView()}</div>`.mount(el);

        expect(el.textContent).toContain("404");
        expect(el.textContent).toContain("/unknown");
    });

    it("renders empty span if depth exceeds matched component chain", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` }
        ]);
        r.navigate("/");

        const el = document.createElement("div");
        // Requerimos profundidad 1, pero solo hay un componente raíz (profundidad 0)
        html`<div>${new RouterView(1)}</div>`.mount(el);

        expect(el.innerHTML).toContain("<span></span>");
    });
});

// ── Link Component ────────────────────────────────────────────────────────────

describe("Link component", () => {
    it("renders an anchor tag with correct href", () => {
        createRouter([{ path: "/", component: () => html`<p>home</p>` }]);
        const link = new Link("/about", "About Us");

        const el = document.createElement("div");
        link.render().mount(el);

        const a = el.querySelector("a")!;
        expect(a.getAttribute("href")).toBe("/about");
        expect(a.textContent).toBe("About Us");
    });

    it("prepends base path to href", () => {
        createRouter([{ path: "/", component: () => html`<p>home</p>` }], { base: "/base" });
        const link = new Link("/about", "About");

        const el = document.createElement("div");
        link.render().mount(el);

        const a = el.querySelector("a")!;
        expect(a.getAttribute("href")).toBe("/base/about");
    });

    it("prevents default and navigates on click", () => {
        const r = createRouter([{ path: "/", component: () => html`<p>home</p>` }]);
        const navSpy = vi.spyOn(r, "navigate").mockImplementation(() => { });

        const link = new Link("/about", "About");
        const el = document.createElement("div");

        // 1. OBLIGATORIO: Adjuntarlo al body para que la DELEGACIÓN DE EVENTOS de Nix.js funcione
        document.body.appendChild(el);
        link.render().mount(el);

        const a = el.querySelector("a")!;

        // 2. Usamos un evento normal y dejamos que el DOM maneje el state interno
        const event = new MouseEvent("click", { bubbles: true, cancelable: true });

        a.dispatchEvent(event);

        // 3. Comprobamos la propiedad nativa defaultPrevented
        expect(event.defaultPrevented).toBe(true);
        expect(navSpy).toHaveBeenCalledWith("/about");

        navSpy.mockRestore();
        document.body.removeChild(el); // Limpiar el DOM
    });

    it("styles as active when router matches link path", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/active", component: () => html`<p>active</p>` }
        ]);
        r.navigate("/active");

        const linkActive = new Link("/active", "Active");
        const linkInactive = new Link("/other", "Other");

        const el = document.createElement("div");
        linkActive.render().mount(el);
        linkInactive.render().mount(el);

        const aActive = el.querySelectorAll("a")[0];
        const aInactive = el.querySelectorAll("a")[1];

        // Verifica si aplica colores (Vitest/JSDOM los transforma a rgb)
        expect(aActive.style.color).toMatch(/rgb\(56, 189, 248\)|#38bdf8/);
        expect(aInactive.style.color).toMatch(/rgb\(163, 163, 163\)|#a3a3a3/);
    });
});

// ── Popstate Edge Cases ───────────────────────────────────────────────────────

describe("Popstate edge cases", () => {
    it("swallows exceptions in afterEach during popstate", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/test", component: () => html`<p>test</p>` }
        ]);
        r.navigate("/");
        r.navigate("/test");

        r.afterEach(() => { throw new Error("popstate hook crash"); });

        // Simular navegación hacia atrás con popstate
        expect(() => {
            window.dispatchEvent(new PopStateEvent("popstate"));
        }).not.toThrow();
    });

    it("aborts popstate navigation and restores URL if guard returns false", () => {
        const r = createRouter([
            { path: "/", component: () => html`<p>home</p>` },
            { path: "/test", component: () => html`<p>test</p>` }
        ]);
        r.navigate("/");

        const pushStateSpy = vi.spyOn(history, "pushState").mockImplementation(() => { });
        // El guard prohibirá la navegación del popstate
        r.beforeEach(() => false);

        window.dispatchEvent(new PopStateEvent("popstate"));

        // Debe re-pushear el estado anterior para restaurar la URL visualmente
        expect(pushStateSpy).toHaveBeenCalled();
        pushStateSpy.mockRestore();
    });
});
