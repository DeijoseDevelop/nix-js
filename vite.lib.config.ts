import { defineConfig } from "vite";
import { resolve } from "path";

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

    build: {
        outDir: "dist/lib",
        // vite clears the dir before building JS — tsc adds .d.ts files after
        emptyOutDir: true,
        sourcemap: true,

        lib: {
            entry: {
                "nix-js": resolve("src/index.ts"),
                "signals": resolve("src/nix/reactivity.ts"),
                "router": resolve("src/nix/router.ts"),
                "form": resolve("src/nix/form.ts"),
                "store": resolve("src/nix/store.ts"),
                "async": resolve("src/nix/async.ts"),
                "template": resolve("src/nix/template/index.ts"),
                "component": resolve("src/nix/component.ts"),
                "context": resolve("src/nix/context.ts"),
                "lifecycle": resolve("src/nix/lifecycle.ts"),
            },
            name: "NixJS",
            formats: ["es", "cjs"],
        },

        rollupOptions: {
            // Nix.js has zero runtime dependencies — nothing to mark external.
            external: [],
            output: [
                {
                    // ESM output
                    format: "es",
                    entryFileNames: "[name].js",
                    chunkFileNames: "[name].js",
                    preserveModules: false,
                },
                {
                    // CJS output
                    format: "cjs",
                    entryFileNames: "[name].cjs",
                    chunkFileNames: "[name].cjs",
                    exports: "named",
                    preserveModules: false,
                },
            ],
        },
    },
});
