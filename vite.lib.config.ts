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
            entry: resolve("src/index.ts"),
            name: "NixJS",
            formats: ["es", "cjs"],
            fileName: (format) => (format === "cjs" ? "nix-js.cjs" : "nix-js.js"),
        },

        rollupOptions: {
            // Nix.js has zero runtime dependencies — nothing to mark external.
            external: [],
            output: {
                // Preserve module structure for better tree-shaking in ES builds
                preserveModules: false,
            },
        },
    },
});
