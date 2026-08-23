import { batch, html, signal } from "/src/nix/index.js";

declare global {
    interface Window {
        __umHandle?: () => void;
        __nix: {
            writes: number;
            writeLog: Array<{ target: Element; name: string; value: string }>;
            initWrites(): void;
            resetWrites(): void;
            writesFor(sel: string): number;
            setSize(v: string): void;
            setColor(v: string): void;
            setFlag(v: boolean): void;
            batchTest(): Promise<{ writes: number; cls: string }>;
            sameTickTest(): Promise<{ writes: number; cls: string }>;
            unmountTmp(): void;
            getClickCount(): number;
            readText(sel: string): string | null;
            readAttr(sel: string, attr: string): string | null;
            readProp(sel: string, prop: string): unknown;
            tryPartial(kind: string): string;
        };
    }
}

const out = document.getElementById("app")!;

// Instrument setAttribute BEFORE any mount so mount writes can be measured.
window.__nix = {
    writes: 0,
    writeLog: [] as Array<{ target: Element; name: string; value: string }>,
    initWrites() {
        const orig = Element.prototype.setAttribute;
        Element.prototype.setAttribute = function (name: string, value: string) {
            (window.__nix.writes as number)++;
            window.__nix.writeLog.push({ target: this as Element, name, value });
            return orig.call(this, name, value);
        };
    },
    resetWrites() {
        window.__nix.writes = 0;
        window.__nix.writeLog = [];
    },
    writesFor(sel: string): number {
        const el = document.querySelector(sel);
        if (!el) return -1;
        return window.__nix.writeLog.filter((w) => w.target === el).length;
    },
    setSize(v) { size.value = v; },
    setColor(v) { color.value = v; },
    setFlag(v) { flag.value = v; },
    async batchTest() {
        batch(() => {
            size.value = "1";
            color.value = "2";
        });
        await new Promise((r) => setTimeout(r, 0));
        const el = document.querySelector('[data-r="multiattr"]');
        return {
            writes: window.__nix.writesFor('[data-r="multiattr"]'),
            cls: el?.className ?? "",
        };
    },
    async sameTickTest() {
        size.value = "a";
        color.value = "b";
        await new Promise((r) => setTimeout(r, 0));
        const el = document.querySelector('[data-r="multiattr"]');
        return {
            writes: window.__nix.writesFor('[data-r="multiattr"]'),
            cls: el?.className ?? "",
        };
    },
    unmountTmp() { window.__umHandle?.(); },
    getClickCount() { return clickCount; },
    readText(sel) {
        return document.querySelector(sel)?.textContent ?? null;
    },
    readAttr(sel, attr) {
        return document.querySelector(sel)?.getAttribute(attr) ?? null;
    },
    readProp(sel, prop) {
        const el = document.querySelector(sel) as unknown as Record<string, unknown>;
        return el ? el[prop] : undefined;
    },
    tryPartial(kind) {
        try {
            switch (kind) {
                case "boolean": html`<input disabled="a ${"b"}">`; break;
                case "event": html`<button @click="a ${"b"}">`; break;
                case "ref": html`<div ref="a ${"b"}">`; break;
                case "show": html`<div show="a ${"b"}">`; break;
                case "hide": html`<div hide="a ${"b"}">`; break;
                case "dynamic": html`<div data-${"x"}="1">`; break;
                case "tagname": html`<${"div"}>`; break;
                case "unclosed": html`<div class="a ${"b"}>`; break;
                default: return "UNKNOWN-KIND";
            }
            return "NO-ERROR";
        } catch (err) {
            return err instanceof Error ? err.message : String(err);
        }
    },
};

window.__nix.initWrites();

// --- Static partial cases ---------------------------------------------------

const obj = { toString: () => "obj" };

const staticTpl = html`
  <p data-c="pre" class="btn ${"big"} size-${"x"} end">prefix-infix</p>
  <p data-c="suf" id=suf-${"x"}>suffix</p>
  <p data-c="inf" class="a ${"1"} b">infix</p>
  <p data-c="adj" id=${1}${2}>adjacent</p>
  <p data-c="null" class="x ${null} y">null</p>
  <p data-c="undef" class="x ${undefined} y">undefined</p>
  <p data-c="false" class="x ${false} y">false</p>
  <p data-c="nums" class="x ${1.5} ${10n} y">nums</p>
  <p data-c="arr" class="x ${[1, "a"]} y">array</p>
  <p data-c="obj" class="x ${obj} y">object</p>
  <p data-c="sq" data-x='q ${"s"}' title="it's ${"fine"}">single-quote</p>
  <p data-c="unq" id=pre-${"v"}-post>unquoted</p>
  <p data-c="mixed" class="btn ${"s"} mid ${"e"}">mixed</p>
  <p data-c="multi" class="a${"1"}b${"2"}c">multi</p>
  <p data-c="empty" class="${""}x${""}">empty-static</p>
  <p data-c="spaces" class = "sp ${"1"}">spaces-around-eq</p>
  <div data-c="nested"><span class="s-${"n"}">${"text"}</span></div>
`;

const staticZone = document.createElement("div");
staticZone.id = "static";
out.appendChild(staticZone);
staticTpl.mount(staticZone);

// --- Reactive cases ----------------------------------------------------------

const size = signal("lg");
const color = signal("red");
const flag = signal(true);

const reactiveTpl = html`
  <p data-r="attr" class="btn btn-${() => size.value}">attr</p>
  <p data-r="multiattr" class="${() => color.value}-${() => size.value}">multiattr</p>
  <p data-r="switch" class="${() => (flag.value ? "on" : "off")}">switch</p>
  <p data-r="mix" class="s-${() => size.value} c-${"static"}">mix</p>
  <input data-r="prop" value="pre-${() => size.value}" />
  <input data-r="checked" type="checkbox" checked=${true} />
  <input data-r="disabled" disabled=${false} />
  <input data-r="disabledTrue" disabled=${() => flag.value} />
`;

const reactiveZone = document.createElement("div");
reactiveZone.id = "reactive";
out.appendChild(reactiveZone);
reactiveTpl.mount(reactiveZone);

// --- Unmount target ----------------------------------------------------------

const unmountTpl = html`<p data-u="tmp" class="t-${() => size.value}">tmp</p>`;
const unmountZone = document.createElement("div");
unmountZone.id = "unmount";
out.appendChild(unmountZone);
window.__umHandle = unmountTpl.mount(unmountZone).unmount;

// --- Extra: eventos + parciales, show/hide, style, unicode, multi-mount ------

let clickCount = 0;

const extraTpl = html`
  <button data-x="evt" class="btn ${"b"}" id=${"i"} @click=${() => clickCount++}>go</button>
  <div data-x="show" show=${() => flag.value} class="sh ${"1"}">visible</div>
  <div data-x="hide" hide=${true} class="hd ${"2"}">hidden</div>
  <div data-x="style" style="color: ${"red"}; font-size: ${"14"}px">styled</div>
  <div data-x="unicode" title="héllo wörld 🎉 ${"ñ"}">unicode</div>
  <div data-x="entities" title="a &amp; b ${"<c>"}">entities</div>
  <div data-x="quotes" title="say ${'"hi"'} x">quotes</div>
`;

const extraZone = document.createElement("div");
extraZone.id = "extra";
out.appendChild(extraZone);
extraTpl.mount(extraZone);

// Múltiples mounts del mismo template con parciales
const multiTpl = html`<span data-m="multi" class="m-${"v"}">${"c"}</span>`;
const multiA = document.createElement("div");
const multiB = document.createElement("div");
out.appendChild(multiA);
out.appendChild(multiB);
multiTpl.mount(multiA);
multiTpl.mount(multiB);

// --- URL sanitization --------------------------------------------------------

const secTpl = html`
  <a data-u="js1" href="java${"script:"}alert(1)">js1</a>
  <a data-u="js2" href="${"javascript:alert(1)"}x">js2</a>
  <a data-u="js3" href="java${"\tscript:alert(1)"}">js3</a>
  <a data-u="js4" href="javascript:${"alert(1)"}">js4</a>
  <a data-u="data" href="data:${"text/html"},">data</a>
  <a data-u="safe" href="https://x.dev/${"a"}/b?q=${"c"}">safe</a>
  <img data-u="img" src="/img/${"cat"}.png" />
`;

const secZone = document.createElement("div");
secZone.id = "sec";
out.appendChild(secZone);
secTpl.mount(secZone);

// --- SVG / custom elements / ARIA / data -------------------------------------

const miscTpl = html`
  <svg><use data-s="use" xlink:href="#icon-${"home"}"></use></svg>
  <my-widget data-s="custom" class="x ${"y"}"></my-widget>
  <div data-s="aria" aria-checked="a ${"b"}" data-x="d ${"e"}"></div>
`;

const miscZone = document.createElement("div");
miscZone.id = "misc";
out.appendChild(miscZone);
miscTpl.mount(miscZone);

window.__nix.resetWrites();