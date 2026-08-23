import { test, expect } from "@playwright/test";

test.describe("SSR + hydration — browser real", () => {
    test("SSR sin markers: HTML servido contiene el atributo compuesto", async ({ page }) => {
        const response = await page.goto("/ssr-plain");
        expect(response?.status()).toBe(200);
        const html = await response!.text();
        expect(html).toContain('class="card-big"');
        expect(html).toContain('href="/blog/post?q=big"');
        expect(html).toContain('value="pre-big"');
        // Sin markers de hidratación.
        expect(html).not.toContain("data-nix-a-");
    });

    test("SSR con markers: un marker por atributo lógico", async ({ page }) => {
        const response = await page.goto("/hydrate");
        expect(response?.status()).toBe(200);
        const html = await response!.text();
        expect(html).toContain('data-nix-a-0="class"');
        expect(html).toContain('data-nix-a-1="href"');
        expect(html).toContain('data-nix-a-2="value"');
        expect(html).toContain('data-nix-a-3="class"');
        expect(html.match(/data-nix-a-/g)?.length).toBe(4);
        expect(html).toContain("<!--nix-4-->");
    });

    test("hidratación: DOM SSR y DOM cliente convergen", async ({ page }) => {
        await page.goto("/hydrate");
        await expect(page.locator('[data-h="card"]')).toHaveClass("card-big");
        await expect(page.locator('[data-h="link"]')).toHaveAttribute(
            "href",
            "/blog/post?q=big",
        );
        await expect(page.locator('[data-h="input"]')).toHaveValue("pre-big");
        await expect(page.locator('[data-h="static"]')).toHaveClass("s-fixed");
        await expect(page.locator('[data-h="plain"]')).toHaveText("red");
        // Sin markers residuales.
        expect(await page.locator("[data-nix-a-]").count()).toBe(0);
        expect(await page.locator("comment").count()).toBe(0);
    });

    test("hidratación: updates reactivos posteriores", async ({ page }) => {
        await page.goto("/hydrate");
        await expect(page.locator('[data-h="card"]')).toHaveClass("card-big");
        await page.evaluate(() => window.__hyd.setSize("small"));
        await expect(page.locator('[data-h="card"]')).toHaveClass("card-small");
        await expect(page.locator('[data-h="link"]')).toHaveAttribute(
            "href",
            "/blog/post?q=small",
        );
        await expect(page.locator('[data-h="input"]')).toHaveValue("pre-small");
        await page.evaluate(() => window.__hyd.setColor("blue"));
        await expect(page.locator('[data-h="plain"]')).toHaveText("blue");
    });

    test("hidratación: unmount elimina efectos (sin updates tardíos)", async ({ page }) => {
        await page.goto("/hydrate");
        await expect(page.locator('[data-h="card"]')).toHaveClass("card-big");
        await page.evaluate(() => window.__hyd.unmount());
        await page.evaluate(() => window.__hyd.setSize("z"));
        await page.evaluate(() => window.__hyd.setColor("z"));
        // Sin updates tras unmount: la clase del nodo hidratado no cambia.
        await expect(page.locator('[data-h="card"]')).toHaveClass("card-big");
        await expect(page.locator('[data-h="plain"]')).toHaveText("red");
    });

    test("streaming: los chunks concatenados reconstruyen el HTML completo", async ({ page }) => {
        const response = await page.goto("/stream");
        expect(response?.status()).toBe(200);
        const html = await response!.text();
        // El streaming emite el atributo compuesto íntegro y los markers.
        expect(html).toContain('class="card-big"');
        expect(html).toContain('data-nix-a-0="class"');
        expect(html).toContain('href="/blog/post?q=big"');
        // La página stream es hidratable de la misma forma.
        await expect(page.locator('[data-h="card"]')).toHaveClass("card-big");
        await page.evaluate(() => window.__hyd.setSize("streamed"));
        await expect(page.locator('[data-h="card"]')).toHaveClass("card-streamed");
    });

    test("keyed SSR sin markers: li con parciales", async ({ page }) => {
        const response = await page.goto("/ssr-keyed-plain");
        expect(response?.status()).toBe(200);
        const html = await response!.text();
        expect(html).toContain('<li data-h="item" class="item-1 n-a">a</li>');
        expect(html).toContain('<li data-h="item" class="item-2 n-b">b</li>');
        expect(html).toContain('<li data-h="item" class="item-3 n-c">c</li>');
    });

    test("keyed SSR con markers + hidratación", async ({ page }) => {
        await page.goto("/hydrate-keyed");
        await expect(page.locator('[data-h="item"]')).toHaveCount(3);
        await expect(page.locator('[data-h="item"]').nth(0)).toHaveClass("item-1 n-a");
        await expect(page.locator('[data-h="item"]').nth(1)).toHaveClass("item-2 n-b");
        await expect(page.locator('[data-h="item"]').nth(2)).toHaveClass("item-3 n-c");
        await expect(page.locator('[data-h="item"]').nth(0)).toHaveText("a");
        await expect(page.locator('[data-h="item"]').nth(2)).toHaveText("c");
    });

    test("keyed: mount cliente puro con el mismo template", async ({ page }) => {
        await page.goto("/hydrate-keyed");
        await page.evaluate(() => window.__keyed.mountClient());
        const items = await page.evaluate(() => window.__keyed.items());
        expect(items).toEqual(["item-1 n-a", "item-2 n-b", "item-3 n-c", "item-1 n-a", "item-2 n-b", "item-3 n-c"]);
        // El SSR hidratado mantiene sus 3 items; el mount cliente añade 3 más.
        expect(await page.evaluate(() => window.__keyed.count())).toBe(6);
        // El unmount del hydrate desactiva efectos sin eliminar el DOM.
        await page.evaluate(() => window.__keyed.unmount());
        expect(await page.evaluate(() => window.__keyed.count())).toBe(6);
    });
});