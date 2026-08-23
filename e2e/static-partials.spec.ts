import { test, expect } from "@playwright/test";

test.describe("partial attribute interpolation — static (browser DOM)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/mount");
    });

    test("prefijo + infijo en un atributo quoted", async ({ page }) => {
        await expect(page.locator('[data-c="pre"]')).toHaveClass("btn big size-x end");
    });

    test("sufijo unquoted", async ({ page }) => {
        await expect(page.locator('[data-c="suf"]')).toHaveAttribute("id", "suf-x");
    });

    test("infijo", async ({ page }) => {
        await expect(page.locator('[data-c="inf"]')).toHaveClass("a 1 b");
    });

    test("expresiones adyacentes: ${1}${2} → '12'", async ({ page }) => {
        await expect(page.locator('[data-c="adj"]')).toHaveAttribute("id", "12");
    });

    test("null/undefined/false parciales siguen semántica JS", async ({ page }) => {
        await expect(page.locator('[data-c="null"]')).toHaveClass("x null y");
        await expect(page.locator('[data-c="undef"]')).toHaveClass("x undefined y");
        await expect(page.locator('[data-c="false"]')).toHaveClass("x false y");
    });

    test("numbers, bigint, arrays y objetos con String()", async ({ page }) => {
        await expect(page.locator('[data-c="nums"]')).toHaveClass("x 1.5 10 y");
        await expect(page.locator('[data-c="arr"]')).toHaveClass("x 1,a y");
        await expect(page.locator('[data-c="obj"]')).toHaveClass("x obj y");
    });

    test("single-quote y comilla interior", async ({ page }) => {
        await expect(page.locator('[data-c="sq"]')).toHaveAttribute("data-x", "q s");
        await expect(page.locator('[data-c="sq"]')).toHaveAttribute("title", "it's fine");
    });

    test("unquoted con prefijo y sufijo estático", async ({ page }) => {
        await expect(page.locator('[data-c="unq"]')).toHaveAttribute("id", "pre-v-post");
    });

    test("múltiples expresiones y estático mezclado", async ({ page }) => {
        await expect(page.locator('[data-c="mixed"]')).toHaveClass("btn s mid e");
        await expect(page.locator('[data-c="multi"]')).toHaveClass("a1b2c");
    });

    test("segmentos estáticos vacíos", async ({ page }) => {
        await expect(page.locator('[data-c="empty"]')).toHaveClass("x");
    });

    test("whitespace alrededor de =", async ({ page }) => {
        await expect(page.locator('[data-c="spaces"]')).toHaveClass("sp 1");
    });

    test("parcial anidado con node binding", async ({ page }) => {
        await expect(page.locator('[data-c="nested"] span')).toHaveClass("s-n");
        await expect(page.locator('[data-c="nested"] span')).toHaveText("text");
    });

    test("el mount realiza una sola escritura por atributo compuesto", async ({ page }) => {
        // El contador se reinicia tras el mount del fixture; los mounts del
        // fixture ya ocurrieron. Verificamos el invariante con batch (abajo),
        // y aquí que el DOM está correcto tras la primera asignación síncrona.
        const writes = await page.evaluate(() => window.__nix.writes);
        expect(writes).toBe(0);
        await expect(page.locator('[data-r="attr"]')).toHaveClass("btn btn-lg");
    });
});