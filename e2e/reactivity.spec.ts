import { test, expect } from "@playwright/test";

test.describe("partial attribute interpolation — reactivity (browser DOM)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/mount");
    });

    test("una señal: update tras cambio", async ({ page }) => {
        await expect(page.locator('[data-r="attr"]')).toHaveClass("btn btn-lg");
        await page.evaluate(() => window.__nix.setSize("xl"));
        await expect(page.locator('[data-r="attr"]')).toHaveClass("btn btn-xl");
    });

    test("varias señales en batch: una sola escritura DOM", async ({ page }) => {
        const result = await page.evaluate(() => window.__nix.batchTest());
        expect(result.writes).toBe(1);
        expect(result.cls).toBe("2-1");
        await expect(page.locator('[data-r="multiattr"]')).toHaveClass("2-1");
    });

    test("varias señales en el mismo tick (sin batch): una sola escritura", async ({ page }) => {
        const result = await page.evaluate(() => window.__nix.sameTickTest());
        expect(result.writes).toBe(1);
        expect(result.cls).toBe("b-a");
    });

    test("dependency switching dentro del getter compuesto", async ({ page }) => {
        await expect(page.locator('[data-r="switch"]')).toHaveClass("on");
        await page.evaluate(() => window.__nix.setFlag(false));
        await expect(page.locator('[data-r="switch"]')).toHaveClass("off");
        await page.evaluate(() => window.__nix.setFlag(true));
        await expect(page.locator('[data-r="switch"]')).toHaveClass("on");
    });

    test("mezcla de getter reactivo y segmento estático", async ({ page }) => {
        await expect(page.locator('[data-r="mix"]')).toHaveClass("s-lg c-static");
        await page.evaluate(() => window.__nix.setSize("sm"));
        await expect(page.locator('[data-r="mix"]')).toHaveClass("s-sm c-static");
    });

    test("propiedad value con parcial", async ({ page }) => {
        await expect(page.locator('[data-r="prop"]')).toHaveValue("pre-lg");
        await page.evaluate(() => window.__nix.setSize("md"));
        await expect(page.locator('[data-r="prop"]')).toHaveValue("pre-md");
    });

    test("unmount elimina el efecto y los nodos: sin updates tardíos", async ({ page }) => {
        await expect(page.locator('[data-u="tmp"]')).toHaveClass("t-lg");
        await page.evaluate(() => window.__nix.unmountTmp());
        // El unmount elimina el fragmento montado.
        await expect(page.locator('[data-u="tmp"]')).toHaveCount(0);
        await page.evaluate(() => window.__nix.setSize("ghost"));
        // El elemento sigue sin existir y el resto del DOM sí reaccionó.
        await expect(page.locator('[data-u="tmp"]')).toHaveCount(0);
        await expect(page.locator('[data-r="attr"]')).toHaveClass("btn btn-ghost");
    });

    test("booleanos completos: checked/disabled con DOM property", async ({ page }) => {
        await expect(page.locator('[data-r="checked"]')).toBeChecked();
        await expect(page.locator('[data-r="disabled"]')).not.toBeDisabled();
        await page.evaluate(() => window.__nix.setFlag(true));
        await expect(page.locator('[data-r="disabledTrue"]')).toBeDisabled();
        await page.evaluate(() => window.__nix.setFlag(false));
        await expect(page.locator('[data-r="disabledTrue"]')).not.toBeDisabled();
    });

    test("evento @click en elemento con atributos parciales", async ({ page }) => {
        await expect(page.locator('[data-x="evt"]')).toHaveClass("btn b");
        await expect(page.locator('[data-x="evt"]')).toHaveAttribute("id", "i");
        await page.locator('[data-x="evt"]').click();
        expect(await page.evaluate(() => window.__nix.getClickCount())).toBe(1);
        await page.locator('[data-x="evt"]').click();
        expect(await page.evaluate(() => window.__nix.getClickCount())).toBe(2);
    });

    test("show/hide completos coexisten con parciales", async ({ page }) => {
        await expect(page.locator('[data-x="show"]')).toBeVisible();
        await expect(page.locator('[data-x="hide"]')).toBeHidden();
        await page.evaluate(() => window.__nix.setFlag(false));
        await expect(page.locator('[data-x="show"]')).toBeHidden();
        await page.evaluate(() => window.__nix.setFlag(true));
        await expect(page.locator('[data-x="show"]')).toBeVisible();
    });

    test("style parcial con dos segmentos", async ({ page }) => {
        await expect(page.locator('[data-x="style"]')).toHaveAttribute(
            "style",
            "color: red; font-size: 14px",
        );
    });

    test("Unicode y entidades en valores parciales", async ({ page }) => {
        await expect(page.locator('[data-x="unicode"]')).toHaveAttribute(
            "title",
            "héllo wörld 🎉 ñ",
        );
        // Los segmentos estáticos se preservan literalmente: `&amp;` en un
        // template literal es un string JS (no se decodifica como entidad);
        // el `&` dinámico se escribe tal cual vía setAttribute.
        await expect(page.locator('[data-x="entities"]')).toHaveAttribute(
            "title",
            "a &amp; b <c>",
        );
        await expect(page.locator('[data-x="quotes"]')).toHaveAttribute("title", 'say "hi" x');
    });

    test("múltiples mounts del mismo template con parciales", async ({ page }) => {
        await expect(page.locator('[data-m="multi"]')).toHaveCount(2);
        await expect(page.locator('[data-m="multi"]').nth(0)).toHaveClass("m-v");
        await expect(page.locator('[data-m="multi"]').nth(1)).toHaveClass("m-v");
    });
});