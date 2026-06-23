import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createErrorBoundary } from "../nix/template/error-boundary";
import { html } from "../nix/template";
import { signal, nextTick } from "../nix/reactivity";

// =============================================================================
// --- Helpers ---
// =============================================================================

function makeThrowingComponent(msg = "onInit error") {
    return {
        __isNixComponent: true as const,
        render: () => html`<div>never</div>`,
        onInit: () => { throw new Error(msg); },
    };
}

function makeThrowingOnMount(msg = "onMount error") {
    return {
        __isNixComponent: true as const,
        render: () => html`<div class="content">OK</div>`,
        onMount: () => { throw new Error(msg); },
    };
}

// =============================================================================
// --- Render básico ---
// =============================================================================

describe("createErrorBoundary()", () => {
    let container: HTMLElement;

    beforeEach(() => {
        container = document.createElement("div");
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
    });

    it("renderiza el contenido normalmente si no hay error", () => {
        const tpl = createErrorBoundary(
            html`<div class="ok">OK</div>`,
            html`<div class="err">Error</div>`
        );
        tpl.mount(container);

        expect(container.querySelector(".ok")).not.toBeNull();
        expect(container.querySelector(".err")).toBeNull();
    });

    it("inserta un comment marker en el DOM", () => {
        const tpl = createErrorBoundary(
            html`<p>content</p>`,
            html`<p>fallback</p>`
        );
        tpl.mount(container);

        const hasComment = Array.from(container.childNodes).some(
            n => n.nodeType === Node.COMMENT_NODE
        );
        expect(hasComment).toBe(true);
    });

    it("retorna NixTemplate válido", () => {
        const tpl = createErrorBoundary(
            html`<div>x</div>`,
            html`<div>fb</div>`
        );
        expect(tpl.__isNixTemplate).toBe(true);
        expect(typeof tpl.mount).toBe("function");
        expect(typeof tpl._render).toBe("function");
    });

    // =========================================================================
    // --- Errores sincrónicos en componentes ---
    // =========================================================================

    it("muestra fallback cuando el componente lanza en onInit", () => {
        const comp = makeThrowingComponent("onInit error");
        const tpl = createErrorBoundary(
            comp as any,
            html`<div class="fallback">Fallback</div>`
        );

        tpl.mount(container);

        expect(container.querySelector(".fallback")).not.toBeNull();
    });

    it("no muestra el contenido original tras error en onInit", () => {
        const comp = makeThrowingComponent();
        const tpl = createErrorBoundary(
            comp as any,
            html`<div class="fallback">FB</div>`
        );

        tpl.mount(container);

        expect(container.querySelector(".fallback")).not.toBeNull();
        // El contenido original no debe aparecer
        expect(container.textContent).not.toContain("never");
    });

    it("muestra fallback generado por factory function", () => {
        const comp = makeThrowingComponent("custom error");
        let receivedError: unknown;

        const tpl = createErrorBoundary(
            comp as any,
            (err) => {
                receivedError = err;
                return html`<div class="factory-fb">Factory Fallback</div>`;
            }
        );

        tpl.mount(container);

        expect(container.querySelector(".factory-fb")).not.toBeNull();
        expect(receivedError).toBeInstanceOf(Error);
        expect((receivedError as Error).message).toBe("custom error");
    });

    it("la factory de fallback recibe el error correcto", () => {
        const error = new Error("specific error");
        const comp = {
            __isNixComponent: true as const,
            render: () => html`<div>x</div>`,
            onInit: () => { throw error; },
        };

        let capturedErr: unknown;

        createErrorBoundary(comp as any, (err) => {
            capturedErr = err;
            return html`<div>fb</div>`;
        }).mount(container);

        expect(capturedErr).toBe(error);
    });

    it("onInit error es capturado por onError del componente antes del boundary", () => {
        const onError = vi.fn();
        const comp = {
            __isNixComponent: true as const,
            render: () => html`<div class="ok">OK</div>`,
            onInit: () => { throw new Error("init"); },
            onError
        };
        const tpl = createErrorBoundary(comp as any, html`<div>FB</div>`);
        tpl.mount(container);

        expect(onError).toHaveBeenCalled();
        expect(container.querySelector(".ok")).not.toBeNull();
    });

    it("onMount error es capturado por onError del componente antes del boundary", () => {
        const onError = vi.fn();
        const comp = {
            __isNixComponent: true as const,
            render: () => html`<div class="ok">OK</div>`,
            onMount: () => { throw new Error("mount"); },
            onError
        };
        const tpl = createErrorBoundary(comp as any, html`<div>FB</div>`);
        tpl.mount(container);

        expect(onError).toHaveBeenCalled();
        expect(container.querySelector(".ok")).not.toBeNull();
    });

    it("onMount error sin onError dispara el fallback del boundary", () => {
        const comp = makeThrowingOnMount("mount error");
        const tpl = createErrorBoundary(comp as any, html`<div class="fb">FB</div>`);
        tpl.mount(container);

        expect(container.querySelector(".fb")).not.toBeNull();
    });

    it("ignora errores lanzados durante el unmount cleanup", () => {
        const comp = {
            __isNixComponent: true as const,
            render: () => html`<div class="ok">OK</div>`,
            onUnmount: () => { throw new Error("unmount"); },
            onMount: () => () => { throw new Error("mountCleanup"); }
        };
        const tpl = createErrorBoundary(comp as any, html`<div>FB</div>`);
        const handle = tpl.mount(container);

        expect(() => handle.unmount()).not.toThrow();
    });

    it("maneja errores reactivos asíncronos diferidos (deferredError) en el primer render", () => {
        // Un error síncrono que ocurre dentro del efecto reactivo inmediatamente
        const tpl = createErrorBoundary(
            html`<div>${() => { throw new Error("sync deferred"); }}</div>`,
            html`<div class="fb">FB</div>`
        );
        tpl.mount(container);
        expect(container.querySelector(".fb")).not.toBeNull();
    });

    it("no re-ejecuta el fallback si el error se vuelve a disparar", async () => {
        const shouldThrow = signal(true);
        const tpl = createErrorBoundary(
            html`<div>${() => { if (shouldThrow.value) throw new Error("err"); return "ok"; }}</div>`,
            html`<div class="fb">FB</div>`
        );
        tpl.mount(container);

        // Disparamos otro cambio para que intente procesar de nuevo
        shouldThrow.value = false;
        await nextTick();
        shouldThrow.value = true;
        await nextTick();

        // No debe crashear, simplemente se mantiene en el fallback
        expect(container.querySelector(".fb")).not.toBeNull();
    });

    // =========================================================================
    // --- Fallback es un componente ---
    // =========================================================================

    it("renderiza fallback como NixComponent silenciosamente", () => {
        const comp = makeThrowingComponent();
        const fallbackComp = {
            __isNixComponent: true as const,
            render: () => html`<div class="comp-fallback">CompFB</div>`,
        };

        createErrorBoundary(comp as any, fallbackComp as any).mount(container);

        expect(container.querySelector(".comp-fallback")).not.toBeNull();
    });

    it("error en el fallback no propaga hacia arriba", () => {
        const comp = makeThrowingComponent();
        const badFallback = {
            __isNixComponent: true as const,
            render: () => html`<div>fb</div>`,
            onInit: () => { throw new Error("fallback también falla"); },
        };

        expect(() => {
            createErrorBoundary(comp as any, badFallback as any).mount(container);
        }).not.toThrow();
    });

    // =========================================================================
    // --- Template como contenido ---
    // =========================================================================

    it("funciona con NixTemplate como contenido (sin error)", () => {
        const tpl = createErrorBoundary(
            html`<span class="tpl-content">tpl</span>`,
            html`<span class="tpl-fb">fb</span>`
        );
        tpl.mount(container);

        expect(container.querySelector(".tpl-content")).not.toBeNull();
        expect(container.querySelector(".tpl-fb")).toBeNull();
    });

    // =========================================================================
    // --- Cleanup ---
    // =========================================================================

    it("limpia el contenido y el marker al desmontar", () => {
        const tpl = createErrorBoundary(
            html`<div class="content">C</div>`,
            html`<div class="fb">FB</div>`
        );

        const handle = tpl.mount(container);

        expect(container.querySelector(".content")).not.toBeNull();

        handle.unmount();

        expect(container.querySelector(".content")).toBeNull();
        expect(container.innerHTML).toBe("");
    });

    it("limpia el fallback al desmontar (después de error)", () => {
        const comp = makeThrowingComponent();
        const tpl = createErrorBoundary(
            comp as any,
            html`<div class="fb">FB</div>`
        );

        const handle = tpl.mount(container);

        expect(container.querySelector(".fb")).not.toBeNull();

        handle.unmount();

        expect(container.querySelector(".fb")).toBeNull();
    });

    // =========================================================================
    // --- Errores reactivos ---
    // =========================================================================

    it("captura errores reactivos después del mount inicial", async () => {
        const shouldThrow = signal(false);

        // Un componente cuyo effect interno lanza
        const tpl = html`<div>${() => {
            if (shouldThrow.value) throw new Error("reactive error");
            return "ok";
        }}</div>`;

        const boundary = createErrorBoundary(
            tpl,
            html`<div class="reactive-fb">ReactFB</div>`
        );

        boundary.mount(container);

        expect(container.textContent).toContain("ok");

        shouldThrow.value = true;
        await nextTick();

        expect(container.querySelector(".reactive-fb")).not.toBeNull();
    });

    // =========================================================================
    // --- mount con selector string ---
    // =========================================================================

    it("mount acepta selector string", () => {
        const mountEl = document.createElement("div");
        mountEl.id = "eb-mount";
        document.body.appendChild(mountEl);

        const tpl = createErrorBoundary(
            html`<span class="ok">OK</span>`,
            html`<span class="fb">FB</span>`
        );

        tpl.mount("#eb-mount");

        expect(mountEl.querySelector(".ok")).not.toBeNull();

        document.body.removeChild(mountEl);
    });

    it("captura errores del fallback y no rompe la app", () => {
        const comp = makeThrowingComponent();
        const boundary = createErrorBoundary(
            comp as any,
            () => {
                throw new Error("fallback failed");
            }
        );

        boundary.mount(container);

        // The boundary should still render a minimal error placeholder.
        expect(container.querySelector("[data-nix-error-boundary]")).not.toBeNull();
    });

    it("captura errores reactivos del fallback", async () => {
        const shouldThrow = signal(false);
        const comp = makeThrowingComponent();
        const boundary = createErrorBoundary(
            comp as any,
            html`<div>${() => {
                if (shouldThrow.value) throw new Error("reactive fallback error");
                return "fallback";
            }}</div>`
        );

        boundary.mount(container);
        expect(container.textContent).toContain("fallback");

        shouldThrow.value = true;
        await nextTick();

        // Reactive error in fallback should not propagate; the placeholder should be present.
        expect(container.querySelector("[data-nix-error-boundary]")).not.toBeNull();
    });
});
