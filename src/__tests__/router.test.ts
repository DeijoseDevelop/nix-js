import { describe, it, expect } from "vitest";
import { html } from "../nix/template";
import { createRouter, useRouter, RouterView } from "../nix/router";
import type { NavigationGuard } from "../nix/router";

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
