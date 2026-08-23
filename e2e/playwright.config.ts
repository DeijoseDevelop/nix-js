import { defineConfig } from "@playwright/test";
import { chromium, firefox, webkit } from "playwright-core";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const e2eDir = dirname(fileURLToPath(import.meta.url));

/** True if the browser binary + system deps are available in this host. */
async function browserAvailable(name: "chromium" | "firefox" | "webkit"): Promise<boolean> {
    try {
        const launcher = name === "chromium" ? chromium : name === "firefox" ? firefox : webkit;
        const browser = await launcher.launch({ headless: true });
        await browser.close();
        return true;
    } catch {
        return false;
    }
}

const available = await Promise.all([
    browserAvailable("chromium"),
    browserAvailable("firefox"),
    browserAvailable("webkit"),
]);

const [hasChromium, hasFirefox, hasWebkit] = available;
const projects = [
    ...(hasChromium ? [{ name: "chromium", use: { browserName: "chromium" } }] : []),
    ...(hasFirefox ? [{ name: "firefox", use: { browserName: "firefox" } }] : []),
    ...(hasWebkit ? [{ name: "webkit", use: { browserName: "webkit" } }] : []),
];

if (!hasWebkit) {
    console.warn("[nix-e2e] WebKit no disponible (faltan dependencias del sistema); se omite. Ejecuta `sudo npx playwright install-deps` para habilitarlo.");
}
if (!hasFirefox) {
    console.warn("[nix-e2e] Firefox no disponible; se omite.");
}
if (!hasChromium) {
    console.warn("[nix-e2e] Chromium no disponible; se omite.");
}

export default defineConfig({
    testDir: ".",
    timeout: 30_000,
    retries: 0,
    workers: 4,
    fullyParallel: true,
    reporter: [["list"]],
    use: {
        baseURL: "http://127.0.0.1:4175",
        headless: true,
    },
    projects,
    webServer: {
        command: `bun ${resolve(e2eDir, "serve.ts")}`,
        url: "http://127.0.0.1:4175/mount",
        reuseExistingServer: false,
        timeout: 30_000,
        cwd: e2eDir,
    },
});