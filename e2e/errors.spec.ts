import { test, expect } from "@playwright/test";

test.describe("bindings rechazados — mensajes de error (browser DOM)", () => {
    test.beforeEach(async ({ page }) => {
        await page.goto("/mount");
    });

    test("boolean parcial lanza error descriptivo", async ({ page }) => {
        const msg = await page.evaluate(() => window.__nix.tryPartial("boolean"));
        expect(msg).toContain('disabled');
        expect(msg).toContain("binding index 0");
        expect(msg).toContain('disabled=${condition}');
    });

    test("evento parcial lanza error descriptivo", async ({ page }) => {
        const msg = await page.evaluate(() => window.__nix.tryPartial("event"));
        expect(msg).toContain("@click");
        expect(msg).toContain("binding index 0");
        expect(msg).toContain("@click=${handler}");
    });

    test("ref/show/hide parciales lanzan error", async ({ page }) => {
        const ref = await page.evaluate(() => window.__nix.tryPartial("ref"));
        expect(ref).toContain("ref");
        const show = await page.evaluate(() => window.__nix.tryPartial("show"));
        expect(show).toContain("show");
        const hide = await page.evaluate(() => window.__nix.tryPartial("hide"));
        expect(hide).toContain("hide");
    });

    test("atributo dinámico y tag name dinámico lanzan error", async ({ page }) => {
        const dyn = await page.evaluate(() => window.__nix.tryPartial("dynamic"));
        expect(dyn).toContain("attribute name");
        const tag = await page.evaluate(() => window.__nix.tryPartial("tagname"));
        expect(tag).toContain("tag name");
    });

    test("comilla sin cerrar lanza error", async ({ page }) => {
        const msg = await page.evaluate(() => window.__nix.tryPartial("unclosed"));
        expect(msg).toContain("Unclosed quoted attribute value");
    });
});