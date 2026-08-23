import { test, expect } from "@playwright/test";

test.describe("URL sanitization — composed values (browser DOM)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/mount");
    });

    test("javascript: dividido entre partes estáticas y dinámicas", async ({ page }) => {
        await expect(page.locator('[data-u="js1"]')).toHaveAttribute("href", "");
    });

    test("scheme íntegro en segmento dinámico con sufijo", async ({ page }) => {
        await expect(page.locator('[data-u="js2"]')).toHaveAttribute("href", "");
    });

    test("control character entre scheme y payload", async ({ page }) => {
        await expect(page.locator('[data-u="js3"]')).toHaveAttribute("href", "");
    });

    test("javascript: en parte estática, payload dinámico", async ({ page }) => {
        await expect(page.locator('[data-u="js4"]')).toHaveAttribute("href", "");
    });

    test("data:text/html bloqueado", async ({ page }) => {
        await expect(page.locator('[data-u="data"]')).toHaveAttribute("href", "");
    });

    test("URL segura con partes mixtas pasa intacta", async ({ page }) => {
        await expect(page.locator('[data-u="safe"]')).toHaveAttribute(
            "href",
            "https://x.dev/a/b?q=c",
        );
    });

    test("src con ruta segura", async ({ page }) => {
        await expect(page.locator('[data-u="img"]')).toHaveAttribute("src", "/img/cat.png");
    });
});

test.describe("SVG, custom elements, ARIA y data-* (browser DOM)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/mount");
    });

    test("SVG xlink:href con parcial", async ({ page }) => {
        await expect(page.locator('[data-s="use"]')).toHaveAttribute(
            "xlink:href",
            "#icon-home",
        );
    });

    test("custom element con clase parcial", async ({ page }) => {
        await expect(page.locator('[data-s="custom"]')).toHaveClass("x y");
    });

    test("aria-* y data-* no se confunden con booleanos", async ({ page }) => {
        await expect(page.locator('[data-s="aria"]')).toHaveAttribute("aria-checked", "a b");
        await expect(page.locator('[data-s="aria"]')).toHaveAttribute("data-x", "d e");
    });
});