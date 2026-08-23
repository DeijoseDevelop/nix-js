/**
 * Dev server for the browser E2E suite.
 *
 * Serves the mount page, the SSR pages (plain and hydration markers) and the
 * Vite-transformed core sources. Run with `bun e2e/serve.ts`.
 */
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";
import { renderToChunks, renderToString } from "../src/nix/server/index.js";

const root = resolve(import.meta.dirname, "..");
const PORT = 4175;

async function renderPage(file: string, fn: () => Promise<string>) {
    const page = await readFile(resolve(root, "e2e/fixture", file), "utf8");
    const markup = await fn();
    return page.replace("<!--SSR-->", markup);
}

const server = await createServer({
    root,
    logLevel: "error",
    server: {
        port: PORT,
        strictPort: true,
        fs: { allow: [root] },
    },
    plugins: [
        {
            name: "nix-e2e-ssr",
            configureServer(s) {
                s.middlewares.use(async (req, res, next) => {
                    const url = req.url ?? "/";
                    try {
                        if (url === "/mount" || url === "/") {
                            res.setHeader("content-type", "text/html; charset=utf-8");
                            res.end(await readFile(resolve(root, "e2e/fixture/mount.html"), "utf8"));
                            return;
                        }
                        if (url.startsWith("/hydrate-keyed")) {
                            const mod = await s.ssrLoadModule("/e2e/fixture/hydrate-page.ts");
                            res.setHeader("content-type", "text/html; charset=utf-8");
                            res.end(await renderPage("hydrate-keyed.html", () => renderToString(mod.keyedTemplate, { markers: "hydration" })));
                            return;
                        }
                        if (url.startsWith("/ssr-keyed-plain")) {
                            const mod = await s.ssrLoadModule("/e2e/fixture/hydrate-page.ts");
                            res.setHeader("content-type", "text/html; charset=utf-8");
                            res.end(await renderPage("hydrate-keyed.html", () => renderToString(mod.keyedTemplate)));
                            return;
                        }
                        if (url.startsWith("/hydrate")) {
                            const mod = await s.ssrLoadModule("/e2e/fixture/hydrate-page.ts");
                            res.setHeader("content-type", "text/html; charset=utf-8");
                            res.end(await renderPage("hydrate.html", () => renderToString(mod.template, { markers: "hydration" })));
                            return;
                        }
                        if (url.startsWith("/ssr-plain")) {
                            const mod = await s.ssrLoadModule("/e2e/fixture/hydrate-page.ts");
                            res.setHeader("content-type", "text/html; charset=utf-8");
                            res.end(await renderPage("hydrate.html", () => renderToString(mod.template)));
                            return;
                        }
                        if (url.startsWith("/stream")) {
                            // Emite el template como chunks de streaming reales y
                            // los concatena; los clientes comprueban que cada chunk
                            // nunca corta un atributo a la mitad.
                            const mod = await s.ssrLoadModule("/e2e/fixture/hydrate-page.ts");
                            const chunks: string[] = [];
                            for await (const chunk of renderToChunks(mod.template, { markers: "hydration" })) {
                                chunks.push(chunk.value);
                            }
                            res.setHeader("content-type", "text/html; charset=utf-8");
                            res.end(await renderPage("hydrate.html", () => chunks.join("")));
                            return;
                        }
                    } catch (err) {
                        console.error("[e2e-server]", err);
                        res.statusCode = 500;
                        res.end(String(err));
                        return;
                    }
                    next();
                });
            },
        },
    ],
});

await server.listen();
// eslint-disable-next-line no-console
console.log(`[nix-e2e] serving at http://127.0.0.1:${PORT}`);