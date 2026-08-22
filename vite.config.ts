import { defineConfig } from "vitest/config";

export default defineConfig({
    // History API SPA fallback:
    // - En desarrollo (`vite`):       Vite lo activa automáticamente.
    // - En producción (`vite preview`): Este bloque lo activa explícitamente.
    //
    // Si despliegas en nginx/Apache/etc., configura el servidor para que
    // responda con index.html a cualquier ruta no-archivo (ver README).
    appType: "spa",
    test: {
        // happy-dom is an optional peer dependency (v3.1 — Fix #5).
        // Install it with: npm install -D happy-dom
        // Or switch to: environment: "jsdom" if you prefer jsdom.
        environment: "happy-dom",
    },
});
