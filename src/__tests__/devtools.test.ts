import { afterEach, describe, expect, it, vi } from "vitest";
import { html } from "../nix/template";
import { mount } from "../nix/component";
import { NixComponent } from "../nix/lifecycle";
import { createRouter, _debugGetRouterInternal, _resetRouter } from "../nix/router";
import { effect, signal } from "../nix/reactivity";
import { disableDevTools, enableDevTools, _listSignals } from "../nix/devtools";

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

    it("updates components panel route context on navigation", async () => {
        vi.useFakeTimers();
        try {
            const router = createRouter([
                { path: "/", component: () => html`<div>Home</div>` },
                { path: "/about", component: () => html`<div>About</div>` },
            ]);

            const handle = enableDevTools({ initiallyOpen: true, refreshMs: 120 });
            const componentsTab = document.querySelector("button[data-nix-devtools-tab='components']") as HTMLButtonElement;
            componentsTab.click();

            await vi.advanceTimersByTimeAsync(160);

            const content = document.querySelector("[data-nix-devtools-content]") as HTMLDivElement;
            expect(content.textContent).toContain("current:");
            expect(content.textContent).toContain("/");

            await router.navigate("/about");
            await vi.advanceTimersByTimeAsync(160);

            expect(content.textContent).toContain("/about");

            handle.disable();
        } finally {
            vi.useRealTimers();
        }
    });

    it("sees router injected via mount options", () => {
        _resetRouter();
        const injectedRouter = createRouter([
            { path: "/", component: () => html`<div>Home</div>` },
            { path: "/injected", component: () => html`<div>Injected</div>` },
        ]);
        injectedRouter.navigate("/injected");

        // Intentionally create a global router after the injected one so the
        // devtools must prefer the injected router over the singleton.
        createRouter([
            { path: "/", component: () => html`<div>Global</div>` },
        ]);

        const host = document.createElement("div");
        document.body.appendChild(host);
        const comp = new (class extends NixComponent {
            render() { return html`<div>App</div>`; }
        })();
        const handle = mount(comp, host, { router: injectedRouter });

        const debug = _debugGetRouterInternal();
        expect(debug).not.toBeNull();
        expect(debug?.currentPath).toBe("/injected");

        handle.unmount();
        host.remove();
    });

    it("caps signal history to the configured limit", async () => {
        vi.useFakeTimers();
        try {
            const handle = enableDevTools({ historyLimit: 3 });
            const s = signal(0);
            const stop = effect(() => { s.value; });

            for (let i = 1; i <= 10; i++) {
                s.value = i;
            }

            // _listSignals reads the internal history that should be capped.
            const signals = _listSignals();
            expect(signals.length).toBeGreaterThan(0);
            const tracked = signals.find((sig) => sig.id === (s as unknown as { _debugId?: number })._debugId);
            const target = tracked ?? signals[0];
            expect(target.history.length).toBeLessThanOrEqual(3);

            stop();
            handle.disable();
        } finally {
            vi.useRealTimers();
        }
    });
});
