import { _debugGetRouterInternal } from "./router";
import {
    _setComponentDebugHooks,
    type NixComponent,
} from "./lifecycle";
import {
    _setSignalDebugHooks,
    type Signal,
} from "./reactivity";

export interface DevToolsOptions {
    refreshMs?: number;
    historyLimit?: number;
    initiallyOpen?: boolean;
    position?: "bottom-right" | "bottom-left";
}

type _DevToolsTab = "signals" | "components" | "router";

interface _DevToolsState {
    enabled: boolean;
    activeTab: _DevToolsTab;
    renderedTab: _DevToolsTab | null;
    refreshId: ReturnType<typeof setInterval> | null;
    root: HTMLDivElement | null;
    panel: HTMLDivElement | null;
    content: HTMLDivElement | null;
    dispose: (() => void) | null;
    renderKeys: Record<_DevToolsTab, string>;
    scrollMemo: Record<_DevToolsTab, { top: number; left: number }>;
}

const _state: _DevToolsState = {
    enabled: false,
    activeTab: "signals",
    renderedTab: null,
    refreshId: null,
    root: null,
    panel: null,
    content: null,
    dispose: null,
    renderKeys: { signals: "", components: "", router: "" },
    scrollMemo: {
        signals: { top: 0, left: 0 },
        components: { top: 0, left: 0 },
        router: { top: 0, left: 0 },
    },
};

type _SignalRef = { deref(): Signal<any> | undefined };

interface _SignalMeta {
    id: number;
    createdAt: number;
    lastUpdated: number;
    history: Array<{ at: number; value: unknown }>;
}

interface _SignalSnapshot {
    id: number;
    value: unknown;
    subscriberCount: number;
    createdAt: number;
    lastUpdated: number;
    history: Array<{ at: number; value: unknown }>;
}

interface _ComponentSnapshot {
    id: number;
    parentId: number | null;
    debugName: string;
    mountedAt: number;
    hasDefaultSlot: boolean;
    slotNames: string[];
    props: Record<string, unknown>;
}

interface _ComponentRecord extends _ComponentSnapshot {
    ref: _ComponentRef;
}

type _ComponentRef = { deref(): NixComponent | undefined };

const _signalRefs = new Set<_SignalRef>();
let _signalMeta = new WeakMap<Signal<any>, _SignalMeta>();
let _signalSeq = 1;

let _componentIds = new WeakMap<NixComponent, number>();
const _componentMounted = new Map<number, _ComponentRecord>();
const _componentMountStack: number[] = [];
let _componentSeq = 1;

function _makeSignalRef<T>(s: Signal<T>): _SignalRef {
    if (typeof WeakRef !== "undefined") return new WeakRef(s) as _SignalRef;
    return { deref: () => s };
}

function _makeComponentRef(inst: NixComponent): _ComponentRef {
    if (typeof WeakRef !== "undefined") return new WeakRef(inst) as _ComponentRef;
    return { deref: () => inst };
}

function _ensureSignalMeta<T>(s: Signal<T>, initialValue: T): _SignalMeta {
    const existing = _signalMeta.get(s);
    if (existing) return existing;

    const now = Date.now();
    const meta: _SignalMeta = {
        id: _signalSeq++,
        createdAt: now,
        lastUpdated: now,
        history: [{ at: now, value: initialValue }],
    };
    _signalMeta.set(s, meta);
    _signalRefs.add(_makeSignalRef(s));
    return meta;
}

function _listSignals(): _SignalSnapshot[] {
    const out: _SignalSnapshot[] = [];

    for (const ref of Array.from(_signalRefs)) {
        const s = ref.deref();
        if (!s) {
            _signalRefs.delete(ref);
            continue;
        }

        const meta = _signalMeta.get(s);
        if (!meta) continue;

        const subCount = (s as unknown as { _subs?: Set<() => void> })._subs?.size ?? 0;

        out.push({
            id: meta.id,
            value: s.peek(),
            subscriberCount: subCount,
            createdAt: meta.createdAt,
            lastUpdated: meta.lastUpdated,
            history: meta.history.slice(),
        });
    }

    out.sort((a, b) => b.lastUpdated - a.lastUpdated);
    return out;
}

function _componentName(inst: NixComponent): string {
    const maybeDebugName = (inst as { _debugName?: string })._debugName;
    if (maybeDebugName && maybeDebugName.trim()) return maybeDebugName;
    const ctor = (inst as { constructor?: { name?: string } }).constructor;
    return ctor?.name && ctor.name.trim() ? ctor.name : "AnonymousComponent";
}

function _componentSlotNames(inst: NixComponent): string[] {
    const slots = (inst as unknown as { _slots?: unknown })._slots;
    if (!(slots instanceof Map)) return [];
    return Array.from(slots.keys()).map((k) => String(k));
}

function _componentProps(inst: NixComponent): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(inst as unknown as Record<string, unknown>)) {
        if (
            key === "__isNixComponent" ||
            key === "children" ||
            key === "_debugName" ||
            key.startsWith("_")
        ) {
            continue;
        }
        const value = (inst as unknown as Record<string, unknown>)[key];
        if (typeof value === "function") continue;
        out[key] = value;
    }
    return out;
}

function _mountPathChain(fullPath: string | null): string[] {
    if (!fullPath) return [];
    if (fullPath === "*") return ["*"];

    const parts = fullPath.split("/").filter(Boolean);
    const out: string[] = [];
    let cur = "";
    for (const part of parts) {
        cur += "/" + part;
        out.push(cur);
    }
    return out.length > 0 ? out : ["/"];
}

function _listMountedComponents(): _ComponentSnapshot[] {
    const out: _ComponentSnapshot[] = [];

    for (const [id, item] of _componentMounted) {
        const inst = item.ref.deref();
        if (!inst) {
            _componentMounted.delete(id);
            continue;
        }

        // Keep rows fresh while panel is open (debug name/props can change after mount).
        item.debugName = _componentName(inst);
        item.hasDefaultSlot = inst.children != null;
        item.slotNames = _componentSlotNames(inst);
        item.props = _componentProps(inst);

        out.push({
            id: item.id,
            parentId: item.parentId,
            debugName: item.debugName,
            mountedAt: item.mountedAt,
            hasDefaultSlot: item.hasDefaultSlot,
            slotNames: [...item.slotNames],
            props: { ...item.props },
        });
    }

    out.sort((a, b) => a.id - b.id);
    return out;
}

function _removeMountedComponentSubtree(rootId: number): void {
    const pending = [rootId];
    while (pending.length > 0) {
        const current = pending.pop()!;
        for (const [id, record] of _componentMounted) {
            if (record.parentId === current) pending.push(id);
        }
        _componentMounted.delete(current);
    }
}

function _resetDevtoolsStores(): void {
    _signalRefs.clear();
    _signalMeta = new WeakMap<Signal<any>, _SignalMeta>();
    _signalSeq = 1;

    _componentIds = new WeakMap<NixComponent, number>();
    _componentMounted.clear();
    _componentMountStack.length = 0;
    _componentSeq = 1;
}

function _safeStringify(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean" || value == null) {
        return String(value);
    }
    try {
        return JSON.stringify(value);
    } catch {
        return Object.prototype.toString.call(value);
    }
}

function _escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function _valuePreview(value: unknown, max = 90): string {
    const raw = _safeStringify(value);
    if (raw.length <= max) return raw;
    return raw.slice(0, max - 1) + "…";
}

function _relativeTime(ts: number): string {
    if (!ts) return "-";
    const diff = Date.now() - ts;
    if (diff < 1000) return `${diff}ms ago`;
    if (diff < 60_000) return `${Math.floor(diff / 1000)}s ago`;
    return `${Math.floor(diff / 60_000)}m ago`;
}

function _renderSignals(target: HTMLDivElement): void {
    const signals = _listSignals();
    const key = `${signals.length}:${signals.map((s) => `${s.id}-${s.lastUpdated}-${s.subscriberCount}`).join("|")}`;
    if (_state.renderedTab === "signals" && _state.renderKeys.signals === key) return;
    _state.renderKeys.signals = key;
    _state.renderedTab = "signals";

    const rows = signals
        .map((s) => {
            const fullValue = _safeStringify(s.value);
            const preview = _valuePreview(s.value, 120);
            return `<tr data-nix-devtools-signal-id="${s.id}">
                <td style="padding:6px 8px;white-space:nowrap;">${s.id}</td>
                <td style="padding:6px 8px;max-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:ui-monospace, SFMono-Regular, Menlo, monospace;" title="${_escapeHtml(fullValue)}">${_escapeHtml(preview)}</td>
                <td>${s.subscriberCount}</td>
                <td>${_relativeTime(s.lastUpdated)}</td>
            </tr>`;
        })
        .join("");

    target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong>Signals</strong>
            <span style="opacity:.8">${signals.length} active</span>
        </div>
        <div data-nix-devtools-scroll="signals" style="max-height:260px;overflow:auto;overscroll-behavior:contain;border:1px solid #2f2f35;border-radius:8px;">
            <table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed;">
                <thead>
                    <tr style="background:#1f1f24;">
                        <th style="text-align:left;padding:6px 8px;width:42px;">ID</th>
                        <th style="text-align:left;padding:6px 8px;">Value</th>
                        <th style="text-align:left;padding:6px 8px;width:50px;">Subs</th>
                        <th style="text-align:left;padding:6px 8px;width:84px;">Updated</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>
        </div>
        <p style="margin:8px 0 0 0;font-size:11px;opacity:.75;">Click a row to log full history in console.</p>
    `;

    for (const row of target.querySelectorAll<HTMLTableRowElement>("tr[data-nix-devtools-signal-id]")) {
        row.style.cursor = "pointer";
        row.addEventListener("click", () => {
            const id = Number(row.dataset.nixDevtoolsSignalId);
            const signal = signals.find((s) => s.id === id);
            if (!signal) return;
            console.group(`[Nix DevTools] Signal #${signal.id}`);
            console.log("Current value:", signal.value);
            console.log("Subscribers:", signal.subscriberCount);
            console.table(signal.history.map((h) => ({ at: new Date(h.at).toISOString(), value: h.value })));
            console.groupEnd();
        });
    }
}

interface _TreeNode extends _ComponentSnapshot {
    children: _TreeNode[];
}

function _buildComponentTree(rows: _ComponentSnapshot[]): _TreeNode[] {
    const byId = new Map<number, _TreeNode>();
    const roots: _TreeNode[] = [];

    for (const row of rows) {
        byId.set(row.id, { ...row, children: [] });
    }

    for (const node of byId.values()) {
        if (node.parentId == null) {
            roots.push(node);
            continue;
        }
        const parent = byId.get(node.parentId);
        if (!parent) {
            roots.push(node);
            continue;
        }
        parent.children.push(node);
    }

    return roots;
}

function _renderTreeNode(node: _TreeNode, depth: number): string {
    const pad = 10 + depth * 14;
    const props = Object.keys(node.props).length > 0 ? _safeStringify(node.props) : "{}";
    const slots = node.slotNames.length > 0 ? node.slotNames.join(", ") : "none";

    const header = `<div style="padding:6px 8px 6px ${pad}px;border-bottom:1px solid #24242b;">
        <div><strong>${_escapeHtml(node.debugName)}</strong> <span style="opacity:.7">#${node.id}</span></div>
        <div style="font-size:11px;opacity:.8;">slots: ${slots} | default-slot: ${node.hasDefaultSlot ? "yes" : "no"}</div>
        <div style="font-size:11px;opacity:.8;">props: ${_escapeHtml(_valuePreview(props, 180))}</div>
    </div>`;

    return header + node.children.map((c) => _renderTreeNode(c, depth + 1)).join("");
}

function _renderComponents(target: HTMLDivElement): void {
    const rows = _listMountedComponents();
    const key = `${rows.length}:${rows.map((r) => `${r.id}-${r.parentId}-${r.debugName}-${r.hasDefaultSlot}-${r.slotNames.join(",")}-${_safeStringify(r.props)}`).join("|")}`;
    if (_state.renderedTab === "components" && _state.renderKeys.components === key) return;
    _state.renderKeys.components = key;
    _state.renderedTab = "components";

    const roots = _buildComponentTree(rows);

    target.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
            <strong>Component Tree</strong>
            <span style="opacity:.8">${rows.length} mounted</span>
        </div>
        <div data-nix-devtools-scroll="components" style="max-height:280px;overflow:auto;overscroll-behavior:contain;border:1px solid #2f2f35;border-radius:8px;">
            ${roots.length > 0
            ? roots.map((r) => _renderTreeNode(r, 0)).join("")
            : "<div style='padding:10px;opacity:.75'>No mounted components tracked. Enable devtools before your first mount() to capture initial tree.</div>"}
        </div>
    `;
}

function _renderRouter(target: HTMLDivElement): void {
    const router = _debugGetRouterInternal();
    const key = router
        ? `${router.mode}|${router.base}|${router.currentPath}|${JSON.stringify(router.params)}|${JSON.stringify(router.query)}|${router.matchedPath}|${router.activeGuards.names.join(",")}`
        : "none";
    if (_state.renderedTab === "router" && _state.renderKeys.router === key) return;
    _state.renderKeys.router = key;
    _state.renderedTab = "router";

    if (!router) {
        target.innerHTML = `
            <strong>Router State</strong>
            <div style="margin-top:8px;opacity:.75">No active Nix router instance. Ensure your app uses createRouter()/RouterView from @deijose/nix-js/router.</div>
        `;
        return;
    }

    const chain = _mountPathChain(router.matchedPath);
    target.innerHTML = `
        <strong>Router State</strong>
        <div data-nix-devtools-scroll="router" style="margin-top:8px;font-size:12px;line-height:1.55;max-height:280px;overflow:auto;overscroll-behavior:contain;border:1px solid #2f2f35;border-radius:8px;padding:8px;">
            <div><b>mode</b>: ${router.mode}</div>
            <div><b>base</b>: ${router.base}</div>
            <div><b>current</b>: ${_escapeHtml(router.currentPath)}</div>
            <div><b>params</b>: ${_escapeHtml(_safeStringify(router.params))}</div>
            <div><b>query</b>: ${_escapeHtml(_safeStringify(router.query))}</div>
            <div><b>matched</b>: ${_escapeHtml(router.matchedPath ?? "none")}</div>
            <div><b>matched chain</b>: ${chain.length > 0 ? _escapeHtml(chain.join(" -> ")) : "none"}</div>
            <div><b>guards</b>: ${router.activeGuards.names.length > 0 ? _escapeHtml(router.activeGuards.names.join(", ")) : "none"}</div>
        </div>
    `;
}

function _rememberScroll(tab: _DevToolsTab): void {
    if (!_state.content) return;
    const box = _state.content.querySelector<HTMLElement>(`[data-nix-devtools-scroll='${tab}']`);
    if (!box) return;
    _state.scrollMemo[tab] = { top: box.scrollTop, left: box.scrollLeft };
}

function _restoreScroll(tab: _DevToolsTab): void {
    if (!_state.content) return;
    const box = _state.content.querySelector<HTMLElement>(`[data-nix-devtools-scroll='${tab}']`);
    if (!box) return;
    const memo = _state.scrollMemo[tab];
    box.scrollTop = memo.top;
    box.scrollLeft = memo.left;
    if (box.dataset.nixDevtoolsScrollBound !== "1") {
        box.addEventListener("scroll", () => {
            _state.scrollMemo[tab] = { top: box.scrollTop, left: box.scrollLeft };
        }, { passive: true });
        box.dataset.nixDevtoolsScrollBound = "1";
    }
}

function _refreshPanel(force = false): void {
    if (!_state.content) return;

    const tab = _state.activeTab;
    if (!force) _rememberScroll(tab);

    if (_state.activeTab === "signals") {
        _renderSignals(_state.content);
        _restoreScroll("signals");
        return;
    }
    if (_state.activeTab === "components") {
        _renderComponents(_state.content);
        _restoreScroll("components");
        return;
    }
    _renderRouter(_state.content);
    _restoreScroll("router");
}

function _syncTabButtons(): void {
    if (!_state.panel) return;
    for (const btn of _state.panel.querySelectorAll<HTMLButtonElement>("button[data-nix-devtools-tab]")) {
        const isActive = btn.dataset.nixDevtoolsTab === _state.activeTab;
        btn.style.background = isActive ? "#2d4c7a" : "#1f1f24";
    }
}

function _createOverlay(options: Required<Pick<DevToolsOptions, "position">>): void {
    const root = document.createElement("div");
    root.setAttribute("data-nix-devtools-root", "");
    root.style.position = "fixed";
    root.style.zIndex = "2147483647";
    root.style.bottom = "16px";
    root.style.right = options.position === "bottom-right" ? "16px" : "auto";
    root.style.left = options.position === "bottom-left" ? "16px" : "auto";
    root.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif";

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Nix DevTools";
    button.setAttribute("data-nix-devtools-button", "");
    button.style.background = "#111827";
    button.style.color = "#f9fafb";
    button.style.border = "1px solid #374151";
    button.style.borderRadius = "999px";
    button.style.padding = "8px 12px";
    button.style.cursor = "pointer";
    button.style.boxShadow = "0 6px 18px rgba(0,0,0,.3)";

    const panel = document.createElement("div");
    panel.setAttribute("data-nix-devtools-panel", "");
    panel.style.marginTop = "8px";
    panel.style.width = "460px";
    panel.style.maxWidth = "min(92vw, 460px)";
    panel.style.background = "#15151b";
    panel.style.color = "#e5e7eb";
    panel.style.border = "1px solid #2f2f35";
    panel.style.borderRadius = "12px";
    panel.style.padding = "10px";
    panel.style.display = "none";
    panel.style.boxShadow = "0 14px 28px rgba(0,0,0,.35)";

    const tabs = document.createElement("div");
    tabs.style.display = "flex";
    tabs.style.gap = "6px";
    tabs.style.marginBottom = "10px";

    const content = document.createElement("div");
    content.setAttribute("data-nix-devtools-content", "");

    const makeTab = (name: _DevToolsTab, label: string): HTMLButtonElement => {
        const t = document.createElement("button");
        t.type = "button";
        t.textContent = label;
        t.setAttribute("data-nix-devtools-tab", name);
        t.style.border = "1px solid #353543";
        t.style.borderRadius = "8px";
        t.style.padding = "6px 9px";
        t.style.background = "#1f1f24";
        t.style.color = "#d1d5db";
        t.style.cursor = "pointer";
        t.addEventListener("click", () => {
            _state.activeTab = name;
            _syncTabButtons();
            _refreshPanel(true);
        });
        return t;
    };

    tabs.appendChild(makeTab("signals", "Signals"));
    tabs.appendChild(makeTab("components", "Components"));
    tabs.appendChild(makeTab("router", "Router"));

    button.addEventListener("click", () => {
        panel.style.display = panel.style.display === "none" ? "block" : "none";
        if (panel.style.display === "block") {
            _syncTabButtons();
            _refreshPanel(true);
        }
    });

    panel.appendChild(tabs);
    panel.appendChild(content);
    root.appendChild(button);
    root.appendChild(panel);
    document.body.appendChild(root);

    _state.root = root;
    _state.panel = panel;
    _state.content = content;
}

export function disableDevTools(): void {
    if (!_state.enabled) return;
    _state.enabled = false;

    if (_state.refreshId != null) {
        clearInterval(_state.refreshId);
        _state.refreshId = null;
    }

    _setSignalDebugHooks(null);
    _setComponentDebugHooks(null);
    _resetDevtoolsStores();

    if (_state.root?.parentNode) {
        _state.root.parentNode.removeChild(_state.root);
    }

    _state.root = null;
    _state.panel = null;
    _state.content = null;
    _state.dispose = null;
    _state.renderedTab = null;
    _state.renderKeys = { signals: "", components: "", router: "" };
    _state.scrollMemo = {
        signals: { top: 0, left: 0 },
        components: { top: 0, left: 0 },
        router: { top: 0, left: 0 },
    };
}

export function enableDevTools(options: DevToolsOptions = {}): { disable: () => void } {
    if (typeof document === "undefined") {
        return { disable: () => undefined };
    }

    if (_state.enabled && _state.dispose) {
        return { disable: _state.dispose };
    }

    const refreshMs = Math.max(100, options.refreshMs ?? 350);
    const historyLimit = Math.max(1, options.historyLimit ?? 50);
    const position = options.position ?? "bottom-right";

    _state.enabled = true;
    _state.activeTab = "signals";

    _setSignalDebugHooks({
        onCreate(signal, initialValue) {
            _ensureSignalMeta(signal, initialValue);
        },
        onWrite(signal, value) {
            const meta = _ensureSignalMeta(signal, value);
            const now = Date.now();
            meta.lastUpdated = now;
            meta.history.push({ at: now, value });
            if (meta.history.length > historyLimit) {
                meta.history.splice(0, meta.history.length - historyLimit);
            }
        },
    });

    _setComponentDebugHooks({
        onMountStart(inst) {
            let id = _componentIds.get(inst);
            if (id == null) {
                id = _componentSeq++;
                _componentIds.set(inst, id);
            }

            const parentId = _componentMountStack.length > 0
                ? _componentMountStack[_componentMountStack.length - 1]
                : null;

            _componentMounted.set(id, {
                id,
                parentId,
                debugName: _componentName(inst),
                mountedAt: Date.now(),
                hasDefaultSlot: inst.children != null,
                slotNames: _componentSlotNames(inst),
                props: _componentProps(inst),
                ref: _makeComponentRef(inst),
            });

            _componentMountStack.push(id);
        },
        onMountEnd(inst) {
            const id = _componentIds.get(inst);
            if (id == null) return;

            const entry = _componentMounted.get(id);
            if (entry) {
                entry.debugName = _componentName(inst);
                entry.hasDefaultSlot = inst.children != null;
                entry.slotNames = _componentSlotNames(inst);
                entry.props = _componentProps(inst);
            }

            if (_componentMountStack[_componentMountStack.length - 1] === id) {
                _componentMountStack.pop();
                return;
            }

            const idx = _componentMountStack.lastIndexOf(id);
            if (idx >= 0) _componentMountStack.splice(idx, 1);
        },
        onUnmount(inst) {
            const id = _componentIds.get(inst);
            if (id == null) return;

            _removeMountedComponentSubtree(id);

            const idx = _componentMountStack.lastIndexOf(id);
            if (idx >= 0) _componentMountStack.splice(idx, 1);
        },
    });

    _createOverlay({ position });

    _state.refreshId = setInterval(() => {
        if (_state.panel?.style.display === "block") {
            _refreshPanel();
        }
    }, refreshMs);

    if (options.initiallyOpen && _state.panel) {
        _state.panel.style.display = "block";
        _syncTabButtons();
        _refreshPanel(true);
    }

    const dispose = () => disableDevTools();
    _state.dispose = dispose;
    return { disable: dispose };
}
