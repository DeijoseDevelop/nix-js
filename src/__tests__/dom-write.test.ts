import { describe, it, expect, vi } from "vitest";
import { queueDOMWrite } from "../nix/template/dom-write";

describe("queueDOMWrite()", () => {
    it("ejecuta la tarea en la siguiente microtarea", async () => {
        const fn = vi.fn();
        queueDOMWrite(fn);

        expect(fn).not.toHaveBeenCalled();

        await Promise.resolve(); // flush microtask
        await Promise.resolve(); // double flush for queueMicrotask

        expect(fn).toHaveBeenCalledOnce();
    });

    it("ejecuta múltiples tareas en un solo microtask flush", async () => {
        const calls: number[] = [];
        queueDOMWrite(() => calls.push(1));
        queueDOMWrite(() => calls.push(2));
        queueDOMWrite(() => calls.push(3));

        await Promise.resolve();
        await Promise.resolve();

        expect(calls).toEqual([1, 2, 3]);
    });

    it("deduplicata tareas idénticas (Set semántica)", async () => {
        const fn = vi.fn();
        queueDOMWrite(fn);
        queueDOMWrite(fn); // misma referencia de función

        await Promise.resolve();
        await Promise.resolve();

        // Set elimina duplicados por referencia
        expect(fn).toHaveBeenCalledOnce();
    });

    it("las tareas se ejecutan sólo una vez aunque se encolen dos veces", async () => {
        let count = 0;
        const task = () => count++;
        queueDOMWrite(task);
        queueDOMWrite(task);

        await Promise.resolve();
        await Promise.resolve();

        expect(count).toBe(1);
    });

    it("nuevas tareas encoladas en un segundo ciclo se ejecutan en la siguiente microtarea", async () => {
        const first = vi.fn();
        const second = vi.fn();

        queueDOMWrite(first);

        await Promise.resolve();
        await Promise.resolve();

        expect(first).toHaveBeenCalledOnce();
        expect(second).not.toHaveBeenCalled();

        queueDOMWrite(second);

        await Promise.resolve();
        await Promise.resolve();

        expect(second).toHaveBeenCalledOnce();
    });

    it("el orden de ejecución respeta el orden de inserción", async () => {
        const order: string[] = [];
        queueDOMWrite(() => order.push("a"));
        queueDOMWrite(() => order.push("b"));
        queueDOMWrite(() => order.push("c"));

        await Promise.resolve();
        await Promise.resolve();

        expect(order).toEqual(["a", "b", "c"]);
    });

    it("si una tarea lanza, las siguientes sí se ejecutan", async () => {
        const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

        const afterThrow = vi.fn();

        queueDOMWrite(() => { throw new Error("task error"); });
        queueDOMWrite(afterThrow);

        await Promise.resolve();
        await Promise.resolve();

        expect(afterThrow).toHaveBeenCalledOnce();

        consoleSpy.mockRestore();
    });
});
