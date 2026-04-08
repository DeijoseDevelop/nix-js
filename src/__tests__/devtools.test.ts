import { afterEach, describe, expect, it, vi } from "vitest";
import { html } from "../nix/template";
import { mount } from "../nix/component";
import { NixComponent } from "../nix/lifecycle";
import { createRouter, _resetRouter } from "../nix/router";
import { effect, signal } from "../nix/reactivity";
import { disableDevTools, enableDevTools } from "../nix/devtools";

afterEach(() => {
    disableDevTools();
    _resetRouter();
});

describe("devtools overlay", () => {
    it("keeps selected tab and rendered content in sync when switching", async () => {
        vi.useFakeTimers();
        try {
            const handle = enableDevTools({ initiallyOpen: true, refreshMs: 120 });
            const s = signal(1);
            const stop = effect(() => {
                s.value;
            });

            await vi.advanceTimersByTimeAsync(140);

            const signalsTab = document.querySelector("button[data-nix-devtools-tab='signals']") as HTMLButtonElement;
            const componentsTab = document.querySelector("button[data-nix-devtools-tab='components']") as HTMLButtonElement;
            const content = document.querySelector("[data-nix-devtools-content]") as HTMLDivElement;

            expect(content.textContent).toContain("Signals");

            componentsTab.click();
            expect(content.textContent).toContain("Component Tree");

            // No signal changes between tab switches. This used to leave stale component content.
            signalsTab.click();
            expect(content.textContent).toContain("Signals");

            stop();
            handle.disable();
        } finally {
            vi.useRealTimers();
        }
    });

    it("mounts one overlay instance and disposes it", () => {
        const d1 = enableDevTools();
        const d2 = enableDevTools();

        const roots = document.querySelectorAll("[data-nix-devtools-root]");
        expect(roots.length).toBe(1);

        d1.disable();
        d2.disable();

        expect(document.querySelector("[data-nix-devtools-root]")).toBeNull();
    });

    it("shows tracked signals in the signal inspector", async () => {
        vi.useFakeTimers();
        try {
            const logs: unknown[] = [];
            const groupSpy = vi.spyOn(console, "group").mockImplementation((...args: unknown[]) => {
                logs.push(args);
            });
            const tableSpy = vi.spyOn(console, "table").mockImplementation(() => undefined);
            const groupEndSpy = vi.spyOn(console, "groupEnd").mockImplementation(() => undefined);

            const handle = enableDevTools({ initiallyOpen: true, refreshMs: 120 });
            const s = signal(1);
            const stop = effect(() => {
                s.value;
            });
            s.value = 2;

            await vi.advanceTimersByTimeAsync(180);

            const panel = document.querySelector("[data-nix-devtools-panel]") as HTMLDivElement;
            expect(panel).not.toBeNull();
            expect(panel.textContent).toContain("Signals");

            const row = document.querySelector("tr[data-nix-devtools-signal-id]") as HTMLTableRowElement;
            expect(row).not.toBeNull();
            row.click();

            expect(groupSpy).toHaveBeenCalled();
            expect(tableSpy).toHaveBeenCalled();
            expect(groupEndSpy).toHaveBeenCalled();

            stop();
            handle.disable();
            groupSpy.mockRestore();
            tableSpy.mockRestore();
            groupEndSpy.mockRestore();
        } finally {
            vi.useRealTimers();
        }
    });

    it("shows mounted components in component tree panel", async () => {
        vi.useFakeTimers();
        try {
            class TestCard extends NixComponent {
                title = "hello";
                render() {
                    return html`<div class="card">Card</div>`;
                }
            }

            const host = document.createElement("div");
            document.body.appendChild(host);

            const handle = enableDevTools({ initiallyOpen: true, refreshMs: 120 });
            const c = new TestCard().setDebugName("TestCardDebug");
            const mountHandle = mount(c, host);

            const tab = document.querySelector("button[data-nix-devtools-tab='components']") as HTMLButtonElement;
            tab.click();

            await vi.advanceTimersByTimeAsync(180);

            const content = document.querySelector("[data-nix-devtools-content]") as HTMLDivElement;
            expect(content.textContent).toContain("Component Tree");
            expect(content.textContent).toContain("TestCardDebug");

            mountHandle.unmount();
            handle.disable();
            host.remove();
        } finally {
            vi.useRealTimers();
        }
    });

    it("refreshes component panel when tracked component props change", async () => {
        vi.useFakeTimers();
        try {
            class CounterCard extends NixComponent {
                count = 0;

                render() {
                    return html`<div>${() => this.count}</div>`;
                }
            }

            const host = document.createElement("div");
            document.body.appendChild(host);

            const handle = enableDevTools({ initiallyOpen: true, refreshMs: 120 });
            const inst = new CounterCard().setDebugName("CounterCard");
            const mountHandle = mount(inst, host);

            const tab = document.querySelector("button[data-nix-devtools-tab='components']") as HTMLButtonElement;
            tab.click();
            await vi.advanceTimersByTimeAsync(160);

            let content = document.querySelector("[data-nix-devtools-content]") as HTMLDivElement;
            expect(content.textContent).toContain("CounterCard");
            expect(content.textContent).toContain("count");
            expect(content.textContent).toContain("0");

            inst.count = 42;
            await vi.advanceTimersByTimeAsync(160);

            content = document.querySelector("[data-nix-devtools-content]") as HTMLDivElement;
            expect(content.textContent).toContain("42");

            mountHandle.unmount();
            handle.disable();
            host.remove();
        } finally {
            vi.useRealTimers();
        }
    });

    it("shows router state in router panel", async () => {
        vi.useFakeTimers();
        try {
            createRouter([
                { path: "/", component: () => html`<div>Home</div>` },
                { path: "/about", component: () => html`<div>About</div>` },
            ]);

            const handle = enableDevTools({ initiallyOpen: true, refreshMs: 120 });
            const tab = document.querySelector("button[data-nix-devtools-tab='router']") as HTMLButtonElement;
            tab.click();

            await vi.advanceTimersByTimeAsync(180);

            const content = document.querySelector("[data-nix-devtools-content]") as HTMLDivElement;
            expect(content.textContent).toContain("Router State");
            expect(content.textContent).toContain("current");
            expect(content.textContent).toContain("/");

            handle.disable();
        } finally {
            vi.useRealTimers();
        }
    });
});
