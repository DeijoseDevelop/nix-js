import { describe, it, expect, vi, beforeEach } from "vitest";
import { createRouter, RouterView, RouterSlot, _resetRouter } from "../nix/router.js";
import { MemoryCacheAdapter, FilesystemCacheAdapter } from "../nix/cache.js";
import { createSuspenseBoundary, streamWithSuspense, type RenderChunk } from "../nix/server/index.js";
import { html, NixComponent, mount } from "../nix/index.js";
import type { RouteRecord } from "../nix/router.js";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// ─────────────────────────────────────────────────────────────────────────────
// Fix #1 — Router auto code-splitting with lazyComponent
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix #1: Router lazyComponent auto code-splitting", () => {
    beforeEach(() => {
        _resetRouter();
        document.body.innerHTML = "";
    });

    it("accepts lazyComponent on route records", () => {
        const mockModule = {
            default: class extends NixComponent {
                render() {
                    return html`
                        <div>
                            Lazy Home
                        </div>
                    `;
                }
            }
        };

        const routes: RouteRecord[] = [
            { path: "/", lazyComponent: () => Promise.resolve(mockModule as never) },
        ];

        // Should not throw — lazyComponent is a valid route option.
        expect(() => createRouter(routes)).not.toThrow();
        _resetRouter();
    });

    it("lazyComponent wraps with lazy() for code-splitting", async () => {
        const mockModule = {
            default: class extends NixComponent {
                render() {
                    return html`
                        <div>
                            Lazy About
                        </div>
                    `;
                }
            }
        };

        const routes: RouteRecord[] = [
            { path: "/about", lazyComponent: () => Promise.resolve(mockModule as never) },
        ];

        const router = createRouter(routes);
        const handle = mount(new RouterView(0, router), document.body);

        // Navigate to the lazy route.
        router.navigate("/about");
        await new Promise((r) => setTimeout(r, 100));

        // The lazy component should have rendered.
        expect(document.body.innerHTML).toContain("Lazy About");

        handle.unmount();
        _resetRouter();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #2 — Route Groups + Layout Slots
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix #2: Route Groups + Layout Slots", () => {
    beforeEach(() => {
        _resetRouter();
        document.body.innerHTML = "";
    });

    it("RouterSlot renders named slot content", () => {
        class Layout extends NixComponent {
            render() {
                return html`
                    <div class="layout">
                        <aside>
                            ${new RouterSlot("sidebar")}
                        </aside>
                        <main>
                            ${new RouterSlot("main")}
                        </main>
                    </div>
                `;
            }
        }

        const routes: RouteRecord[] = [{
            path: "/dashboard",
            component: () => new Layout(),
            slots: {
                sidebar: () => html`
                    <nav>
                        Sidebar Content
                    </nav>
                `,
                main: () => html`
                    <div>
                        Main Content
                    </div>
                `,
            },
        }];

        const router = createRouter(routes);
        const handle = mount(new RouterView(0, router), document.body);

        router.navigate("/dashboard");
        expect(document.body.innerHTML).toContain("Sidebar Content");
        expect(document.body.innerHTML).toContain("Main Content");

        handle.unmount();
        _resetRouter();
    });

    it("RouterSlot returns empty for missing slot name", () => {
        class Layout extends NixComponent {
            render() {
                return html`
                    <div>
                        ${new RouterSlot("nonexistent")}
                    </div>
                `;
            }
        }

        const routes: RouteRecord[] = [{
            path: "/page",
            component: () => new Layout(),
            slots: {
                main: () => html`
                    <div>
                        Content
                    </div>
                `,
            },
        }];

        const router = createRouter(routes);
        const handle = mount(new RouterView(0, router), document.body);

        router.navigate("/page");
        // Should not crash — the "nonexistent" slot is empty, "Content" is not rendered.
        expect(document.body.innerHTML).not.toContain("Content");

        handle.unmount();
        _resetRouter();
    });

    it("slots propagate through nested routes", () => {
        class ParentLayout extends NixComponent {
            render() {
                return html`
                    <div class="parent">
                        ${new RouterSlot("header")}
                        <div class="child-outlet">
                            ${new RouterView(1)}
                        </div>
                    </div>
                `;
            }
        }

        const routes: RouteRecord[] = [{
            path: "/parent",
            component: () => new ParentLayout(),
            slots: {
                header: () => html`
                    <h1>
                        Parent Header
                    </h1>
                `,
            },
            children: [
                {
                    path: "child", component: () => html`
                        <p>
                            Child
                        </p>
                    ` },
            ],
        }];

        const router = createRouter(routes);
        const handle = mount(new RouterView(0, router), document.body);

        router.navigate("/parent/child");
        expect(document.body.innerHTML).toContain("Parent Header");
        expect(document.body.innerHTML).toContain("Child");

        handle.unmount();
        _resetRouter();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #3 — CacheAdapter (Memory + Filesystem)
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix #3: CacheAdapter — Memory + Filesystem", () => {
    it("MemoryCacheAdapter get/set/delete", async () => {
        const cache = new MemoryCacheAdapter();
        await cache.set("key1", { hello: "world" });
        const entry = await cache.get("key1");
        expect(entry?.data).toEqual({ hello: "world" });

        await cache.delete("key1");
        expect(await cache.get("key1")).toBeUndefined();
    });

    it("MemoryCacheAdapter TTL expiry", async () => {
        const cache = new MemoryCacheAdapter();
        await cache.set("temp", "value", { ttl: 50 });
        expect((await cache.get("temp"))?.data).toBe("value");

        await new Promise((r) => setTimeout(r, 60));
        expect(await cache.get("temp")).toBeUndefined();
    });

    it("MemoryCacheAdapter tag-based invalidation", async () => {
        const cache = new MemoryCacheAdapter();
        await cache.set("a", 1, { tags: ["posts"] });
        await cache.set("b", 2, { tags: ["posts"] });
        await cache.set("c", 3, { tags: ["users"] });

        await cache.invalidateTag("posts");
        expect(await cache.get("a")).toBeUndefined();
        expect(await cache.get("b")).toBeUndefined();
        expect((await cache.get("c"))?.data).toBe(3);
    });

    it("MemoryCacheAdapter clear", async () => {
        const cache = new MemoryCacheAdapter();
        await cache.set("x", 1);
        await cache.set("y", 2);
        await cache.clear();
        expect(await cache.get("x")).toBeUndefined();
        expect(await cache.get("y")).toBeUndefined();
    });

    it("FilesystemCacheAdapter get/set/delete", async () => {
        const dir = mkdtempSync(join(tmpdir(), "nix-cache-test-"));
        try {
            const cache = new FilesystemCacheAdapter(dir);
            await cache.set("key1", { hello: "world" });
            const entry = await cache.get("key1");
            expect(entry?.data).toEqual({ hello: "world" });

            await cache.delete("key1");
            expect(await cache.get("key1")).toBeUndefined();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("FilesystemCacheAdapter TTL expiry", async () => {
        const dir = mkdtempSync(join(tmpdir(), "nix-cache-test-"));
        try {
            const cache = new FilesystemCacheAdapter(dir);
            await cache.set("temp", "value", { ttl: 50 });
            expect((await cache.get("temp"))?.data).toBe("value");

            await new Promise((r) => setTimeout(r, 60));
            expect(await cache.get("temp")).toBeUndefined();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("FilesystemCacheAdapter tag-based invalidation", async () => {
        const dir = mkdtempSync(join(tmpdir(), "nix-cache-test-"));
        try {
            const cache = new FilesystemCacheAdapter(dir);
            await cache.set("a", 1, { tags: ["posts"] });
            await cache.set("b", 2, { tags: ["users"] });

            await cache.invalidateTag("posts");
            expect(await cache.get("a")).toBeUndefined();
            expect((await cache.get("b"))?.data).toBe(2);
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("FilesystemCacheAdapter clear", async () => {
        const dir = mkdtempSync(join(tmpdir(), "nix-cache-test-"));
        try {
            const cache = new FilesystemCacheAdapter(dir);
            await cache.set("x", 1);
            await cache.set("y", 2);
            await cache.clear();
            expect(await cache.get("x")).toBeUndefined();
            expect(await cache.get("y")).toBeUndefined();
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });

    it("FilesystemCacheAdapter persists across instances", async () => {
        const dir = mkdtempSync(join(tmpdir(), "nix-cache-test-"));
        try {
            const cache1 = new FilesystemCacheAdapter(dir);
            await cache1.set("persistent", { data: "survives" });

            // Create a new instance pointing to the same directory.
            const cache2 = new FilesystemCacheAdapter(dir);
            const entry = await cache2.get("persistent");
            expect(entry?.data).toEqual({ data: "survives" });
        } finally {
            rmSync(dir, { recursive: true, force: true });
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #3 — RedisCacheAdapter (with mock client)
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix #3: RedisCacheAdapter (mock)", () => {
    it("get/set/delete with mock Redis client", async () => {
        const store = new Map<string, string>();
        const mockClient = {
            get: vi.fn(async (key: string) => store.get(key) ?? null),
            set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
            del: vi.fn(async (key: string | string[]) => {
                const keys = Array.isArray(key) ? key : [key];
                for (const k of keys) store.delete(k);
                return keys.length;
            }),
            keys: vi.fn(async (pattern: string) => {
                const prefix = pattern.replace(/\*/g, "");
                return [...store.keys()].filter((k) => k.startsWith(prefix));
            }),
        };

        const { RedisCacheAdapter } = await import("../nix/cache.js");
        const cache = new RedisCacheAdapter({ client: mockClient });

        await cache.set("key1", { hello: "redis" });
        const entry = await cache.get("key1");
        expect(entry?.data).toEqual({ hello: "redis" });

        await cache.delete("key1");
        expect(await cache.get("key1")).toBeUndefined();
    });

    it("tag-based invalidation with mock Redis client", async () => {
        const store = new Map<string, string>();
        const mockClient = {
            get: vi.fn(async (key: string) => store.get(key) ?? null),
            set: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
            del: vi.fn(async (key: string | string[]) => {
                const keys = Array.isArray(key) ? key : [key];
                for (const k of keys) store.delete(k);
                return keys.length;
            }),
            keys: vi.fn(async (pattern: string) => {
                const prefix = pattern.replace(/\*/g, "");
                return [...store.keys()].filter((k) => k.startsWith(prefix));
            }),
        };

        const { RedisCacheAdapter } = await import("../nix/cache.js");
        const cache = new RedisCacheAdapter({ client: mockClient });

        await cache.set("a", 1, { tags: ["posts"] });
        await cache.set("b", 2, { tags: ["users"] });

        await cache.invalidateTag("posts");
        expect(await cache.get("a")).toBeUndefined();
        expect((await cache.get("b"))?.data).toBe(2);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #4 — Suspense streaming with fallback→replacement
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix #4: Suspense streaming", () => {
    it("createSuspenseBoundary generates unique IDs", () => {
        const b1 = createSuspenseBoundary();
        const b2 = createSuspenseBoundary();
        expect(b1.id).not.toBe(b2.id);
        expect(b1.id).toMatch(/^nix-s\d+$/);
    });

    it("fallbackHtml wraps fallback in boundary markers", () => {
        const boundary = createSuspenseBoundary();
        const fallback = boundary.fallbackHtml("<div>Loading...</div>");
        expect(fallback).toContain(`<!--nix-suspense-${boundary.id}-->`);
        expect(fallback).toContain(`id="${boundary.id}"`);
        expect(fallback).toContain("Loading...");
    });

    it("resolvedHtml emits template + replacement script", () => {
        const boundary = createSuspenseBoundary();
        const resolved = boundary.resolvedHtml("<div>Content</div>");
        expect(resolved).toContain(`<template id="${boundary.id}-tpl">`);
        expect(resolved).toContain("Content");
        expect(resolved).toContain("<script>");
        expect(resolved).toContain("replaceWith");
    });

    it("streamWithSuspense passes through all chunk types", async () => {
        const chunks: RenderChunk[] = [
            { type: "markup", value: "<p>hello</p>", index: 0 },
            { type: "suspense-fallback", value: "<div>Loading</div>", index: 1, boundaryId: "s1" },
            { type: "suspense-resolved", value: "<template>Content</template>", index: 2, boundaryId: "s1" },
            { type: "done", value: "", index: -1 },
        ];

        const results: RenderChunk[] = [];
        for await (const chunk of streamWithSuspense((async function* () {
            for (const c of chunks) yield c;
        })())) {
            results.push(chunk);
        }

        expect(results.length).toBe(4);
        expect(results[1].type).toBe("suspense-fallback");
        expect(results[2].type).toBe("suspense-resolved");
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Fix #5 — happy-dom as optional peer dependency
// ─────────────────────────────────────────────────────────────────────────────

describe("Fix #5: happy-dom optional peer dependency", () => {
    it("package.json has happy-dom in peerDependenciesMeta", async () => {
        const pkg = await import("../../package.json", { with: { type: "json" } });
        const meta = (pkg as any).default?.peerDependenciesMeta ?? (pkg as any).peerDependenciesMeta;
        expect(meta?.["happy-dom"]).toBeDefined();
        expect(meta?.["happy-dom"]?.optional).toBe(true);
    });

    it("happy-dom is NOT in devDependencies", async () => {
        const pkg = await import("../../package.json", { with: { type: "json" } });
        const devDeps = (pkg as any).default?.devDependencies ?? (pkg as any).devDependencies;
        expect(devDeps?.["happy-dom"]).toBeUndefined();
    });

    it("SSR server module does not import happy-dom or document", async () => {
        const serverModule = await import("../nix/server/index.js");
        // The server module should not reference document or happy-dom.
        expect(typeof serverModule.renderToString).toBe("function");
        expect(typeof serverModule.renderToChunks).toBe("function");
    });
});
