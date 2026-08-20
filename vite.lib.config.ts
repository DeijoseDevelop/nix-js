import { defineConfig, type Plugin } from "vite";
import { resolve, dirname } from "path";
import { copyFile, mkdir } from "fs/promises";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));

// Maps each library entry key to its source module path (relative to dist/lib).
// With `preserveModules`, modules that are ALSO entry points are only emitted
// under their entry key name (e.g. `signals.js`), not under their module path
// (e.g. `nix/reactivity.js`). The tsc declarations import internal modules by
// their source path, so arethetypeswrong would fail to resolve the runtime.
// This plugin copies each entry file to its module path so the runtime layout
// matches the declarations exactly.
const ENTRY_TO_MODULE_PATH: Record<string, string> = {
    "nix-js": "index",
    "signals": "nix/reactivity",
    "router": "nix/router",
    "form": "nix/form",
    "store": "nix/store",
    "plugins": "nix/plugins",
    "async": "nix/async",
    "template": "nix/template/index",
    "server": "nix/server/index",
    "hydrate": "nix/hydrate/index",
    "component": "nix/component",
    "context": "nix/context",
    "lifecycle": "nix/lifecycle",
    "devtools": "nix/devtools",
};

function preserveModuleCopies(outDir: string): Plugin {
    return {
        name: "nix-js-preserve-module-copies",
        async closeBundle() {
            for (const [entry, modulePath] of Object.entries(ENTRY_TO_MODULE_PATH)) {
                for (const ext of ["js", "cjs", "js.map", "cjs.map"]) {
                    const src = resolve(outDir, `${entry}.${ext}`);
                    const dest = resolve(outDir, `${modulePath}.${ext}`);
                    try {
                        await mkdir(dirname(dest), { recursive: true });
                        await copyFile(src, dest);
                    } catch (err) {
                        console.warn(`[nix-js] preserveModuleCopies: skipped ${src} (${(err as Error).message})`);
                    }
                }
            }
        },
    };
}

// ── Library build configuration ───────────────────────────────────────────────
//
//   npm run build:lib
//
// Produces:
//   dist/lib/nix-js.js      — ES module  (primary)
//   dist/lib/nix-js.cjs     — CommonJS   (legacy Node.js / bundlers)
//   dist/lib/*.d.ts         — Type declarations (generated separately by tsc)

export default defineConfig({
    // Do not copy the public/ folder into the library output
    publicDir: false,

    plugins: [preserveModuleCopies(resolve(configDir, "dist/lib"))],

    build: {
        outDir: "dist/lib",
        // vite clears the dir before building JS — tsc adds .d.ts files after
        emptyOutDir: true,
        sourcemap: true,
        // Minify with Oxc (Rolldown-native). The previous esbuild mangling
        // collided import bindings with callback parameters in shared chunks,
        // which broke SSR array rendering. Oxc does not reproduce the bug (the
        // artifact is verified by `npm run test:artifact`). Vite 8 deprecated
        // `minify: "esbuild"` in favour of Oxc.
        minify: "oxc",

        lib: {
            entry: {
                "nix-js": resolve("src/index.ts"),
                "signals": resolve("src/nix/reactivity.ts"),
                "router": resolve("src/nix/router.ts"),
                "form": resolve("src/nix/form.ts"),
                "store": resolve("src/nix/store.ts"),
                "plugins": resolve("src/nix/plugins.ts"),
                "async": resolve("src/nix/async.ts"),
                "template": resolve("src/nix/template/index.ts"),
                "server": resolve("src/nix/server/index.ts"),
                "hydrate": resolve("src/nix/hydrate/index.ts"),
                "component": resolve("src/nix/component.ts"),
                "context": resolve("src/nix/context.ts"),
                "lifecycle": resolve("src/nix/lifecycle.ts"),
                "devtools": resolve("src/nix/devtools.ts"),
            },
            name: "NixJS",
            formats: ["es", "cjs"],
        },

        rollupOptions: {
            // Nix.js has zero runtime dependencies — nothing to mark external.
            external: ["node:async_hooks"],
            output: [
                {
                    // ESM output. preserveModules keeps one file per module so
                    // the runtime layout matches the tsc-emitted declarations
                    // (arethetypeswrong requires types to resolve to real
                    // runtime files) and enables per-module tree-shaking.
                    format: "es",
                    entryFileNames: "[name].js",
                    chunkFileNames: "[name].js",
                    preserveModules: true,
                },
                {
                    // CJS output
                    format: "cjs",
                    entryFileNames: "[name].cjs",
                    chunkFileNames: "[name].cjs",
                    exports: "named",
                    preserveModules: true,
                },
            ],
        },
    },
});
