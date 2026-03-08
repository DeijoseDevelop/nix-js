import { signal, computed, effect, batch } from "./nix";
import { html } from "./nix";

// ══════════════════════════════════════════════════════════════
//  FASE 1: Sistema de Reactividad
//  Tests → #tests | Summary → #summary | Demo → #demo
// ══════════════════════════════════════════════════════════════

const testsF1 = document.getElementById("tests")!;
let passedF1 = 0;
let failedF1 = 0;

function groupF1(name: string): void {
  const el = document.createElement("div");
  el.className = "test-group";
  el.textContent = name;
  testsF1.appendChild(el);
}

function assertF1(condition: boolean, description: string): void {
  const el = document.createElement("div");
  el.className = `test-line ${condition ? "pass" : "fail"}`;
  el.textContent = `${condition ? "✅" : "❌"} ${description}`;
  testsF1.appendChild(el);
  if (condition) { passedF1++; } else { failedF1++; console.error(`❌ FALLÓ F1: ${description}`); }
}

// ── Signal básico ──
groupF1("Signal — lectura y escritura");
const count = signal(0);
assertF1(count.value === 0, "Valor inicial es 0");
count.value = 42;
assertF1(count.value === 42, "Asignar valor: ahora es 42");
count.update((n) => n + 8);
assertF1(count.value === 50, "update(n => n + 8): ahora es 50");
count.value = 50;
assertF1(count.value === 50, "Asignar mismo valor no dispara nada");

// ── Signal con distintos tipos ──
groupF1("Signal — distintos tipos de dato");
const text = signal("hola");
assertF1(text.value === "hola", "Signal de string");
const flag = signal(true);
flag.value = false;
assertF1(flag.value === false, "Signal de boolean");
const list = signal([1, 2, 3]);
list.value = [4, 5];
assertF1(list.value.length === 2, "Signal de array");
const obj = signal({ a: 1 });
obj.value = { a: 2 };
assertF1(obj.value.a === 2, "Signal de objeto");

// ── peek() ──
groupF1("Signal — peek (leer sin suscribirse)");
const spy = signal(0);
let peekRuns = 0;
effect(() => { peekRuns++; spy.peek(); });
assertF1(peekRuns === 1, "Effect con peek se ejecuta 1 vez (inicial)");
spy.value = 999;
assertF1(peekRuns === 1, "Cambiar signal NO re-ejecuta (peek no suscribe)");

// ── Effect básico ──
groupF1("Effect — auto-tracking");
const name = signal("Nix");
let effectRuns = 0;
let lastSeen = "";
effect(() => { effectRuns++; lastSeen = name.value; });
assertF1(effectRuns === 1, "Se ejecuta inmediatamente al crearse");
assertF1(lastSeen === "Nix", "Lee el valor actual: 'Nix'");
name.value = "JS";
assertF1(effectRuns === 2, "Se re-ejecuta al cambiar el signal");
assertF1(lastSeen === "JS", "Ve el nuevo valor: 'JS'");
name.value = "JS";
assertF1(effectRuns === 2, "NO se re-ejecuta si el valor es igual");

// ── Effect múltiples signals ──
groupF1("Effect — múltiples dependencias");
const firstName = signal("Juan");
const lastName = signal("Pérez");
let fullName = "";
let multiRuns = 0;
effect(() => { multiRuns++; fullName = `${firstName.value} ${lastName.value}`; });
assertF1(multiRuns === 1, "Ejecución inicial");
assertF1(fullName === "Juan Pérez", "Lee ambos signals");
firstName.value = "Ana";
assertF1(multiRuns === 2, "Re-ejecuta al cambiar firstName");
assertF1(fullName === "Ana Pérez", "Actualiza correctamente");
lastName.value = "García";
assertF1(multiRuns === 3, "Re-ejecuta al cambiar lastName");
assertF1(fullName === "Ana García", "Actualiza correctamente");

// ── Effect cleanup ──
groupF1("Effect — cleanup y dispose");
const toggle = signal(true);
let cleanupRuns = 0;
const dispose = effect(() => { toggle.value; return () => { cleanupRuns++; }; });
assertF1(cleanupRuns === 0, "Cleanup NO se ejecuta al inicio");
toggle.value = false;
assertF1(cleanupRuns === 1, "Cleanup SÍ se ejecuta al re-ejecutar");
dispose();
assertF1(cleanupRuns === 2, "Cleanup se ejecuta al disponer");
toggle.value = true;
assertF1(cleanupRuns === 2, "Después de dispose, ya no reacciona");

// ── Dependencias condicionales ──
groupF1("Effect — dependencias condicionales");
const condition = signal(true);
const depA = signal("A");
const depB = signal("B");
let condRuns = 0;
let condResult = "";
effect(() => { condRuns++; condResult = condition.value ? depA.value : depB.value; });
assertF1(condRuns === 1, "Ejecución inicial (condition=true, lee depA)");
condition.value = false;
assertF1(condRuns === 2, "Cambia condición a false (ahora lee depB)");
condRuns = 0;
depA.value = "A2";
assertF1(condRuns === 0, "Cambiar depA NO dispara (ya no es dependencia)");
depB.value = "B2";
assertF1(condRuns === 1, "Cambiar depB SÍ dispara (es dependencia actual)");
assertF1(condResult === "B2", "Resultado correcto: 'B2'");

// ── Computed ──
groupF1("Computed — valores derivados");
const precio = signal(100);
const cantidad = signal(3);
const total = computed(() => precio.value * cantidad.value);
assertF1(total.value === 300, "100 × 3 = 300");
precio.value = 200;
assertF1(total.value === 600, "200 × 3 = 600 (reacciona a precio)");
cantidad.value = 5;
assertF1(total.value === 1000, "200 × 5 = 1000 (reacciona a cantidad)");

// ── Computed encadenado ──
groupF1("Computed — encadenamiento");
const base = signal(10);
const doubled = computed(() => base.value * 2);
const quadrupled = computed(() => doubled.value * 2);
const label = computed(() => `Resultado: ${quadrupled.value}`);
assertF1(doubled.value === 20, "doubled: 10 × 2 = 20");
assertF1(quadrupled.value === 40, "quadrupled: 20 × 2 = 40");
assertF1(label.value === "Resultado: 40", "label: 'Resultado: 40'");
base.value = 5;
assertF1(doubled.value === 10, "base=5 → doubled=10");
assertF1(quadrupled.value === 20, "→ quadrupled=20");
assertF1(label.value === "Resultado: 20", "→ label='Resultado: 20'");

// ── Computed dentro de effect ──
groupF1("Computed — dentro de effect");
const radius = signal(5);
const area = computed(() => Math.PI * radius.value ** 2);
let areaLog = "";
effect(() => { areaLog = `Área: ${area.value.toFixed(2)}`; });
assertF1(areaLog === "Área: 78.54", "Área de radio 5");
radius.value = 10;
assertF1(areaLog === "Área: 314.16", "Área de radio 10 (effect reacciona)");

// ── Batch ──
groupF1("Batch — agrupar actualizaciones");
const x = signal(0);
const y = signal(0);
let batchRuns = 0;
effect(() => { batchRuns++; x.value; y.value; });
batchRuns = 0;
x.value = 1; y.value = 1;
assertF1(batchRuns === 2, "Sin batch: 2 cambios = 2 ejecuciones");
batchRuns = 0;
batch(() => { x.value = 10; y.value = 20; });
assertF1(batchRuns === 1, "Con batch: 2 cambios = 1 sola ejecución");
assertF1(x.value === 10 && y.value === 20, "Valores correctos después del batch");

// ── Batch anidado ──
groupF1("Batch — anidado");
const z = signal(0);
let nestedRuns = 0;
effect(() => { nestedRuns++; z.value; });
nestedRuns = 0;
batch(() => { z.value = 1; batch(() => { z.value = 2; z.value = 3; }); z.value = 4; });
assertF1(nestedRuns === 1, "Batch anidado: todo se resuelve al final del externo");
assertF1(z.value === 4, "Valor final: 4");

// ── Resumen F1 ──
const summaryF1 = document.getElementById("summary")!;
const allPassedF1 = failedF1 === 0;
summaryF1.innerHTML = `
  <div class="summary ${allPassedF1 ? "all-pass" : "has-fail"}">
    ${allPassedF1 ? "🎉" : "⚠️"} ${passedF1} pasaron, ${failedF1} fallaron
    ${allPassedF1 ? " — ¡Todo funciona!" : ""}
  </div>
`;

// ── Demo Interactivo F1 ──
const demoF1 = document.getElementById("demo")!;
const clicks = signal(0);
const username = signal("Nix");
const doubledClicks = computed(() => clicks.value * 2);
const message = computed(() => `¡Hola ${username.value}! Llevas ${clicks.value} clicks`);

demoF1.innerHTML = `
  <p id="demo-message"></p>
  <div class="demo-value"><span id="demo-count"></span></div>
  <div class="demo-row">
    <button id="btn-dec">➖ Restar</button>
    <button id="btn-inc">➕ Sumar</button>
    <button id="btn-reset">🔄 Reset</button>
    <button id="btn-batch">⚡ Batch +100</button>
  </div>
  <div class="demo-row">
    <label style="color:#a3a3a3">Nombre:</label>
    <input id="input-name" type="text" value="Nix" />
  </div>
  <div class="effect-log" id="demo-log"></div>
`;

document.getElementById("btn-inc")!.addEventListener("click", () => clicks.update((n) => n + 1));
document.getElementById("btn-dec")!.addEventListener("click", () => clicks.update((n) => n - 1));
document.getElementById("btn-reset")!.addEventListener("click", () => { clicks.value = 0; });
document.getElementById("btn-batch")!.addEventListener("click", () => {
  batch(() => { for (let i = 0; i < 100; i++) clicks.update((n) => n + 1); });
});
document.getElementById("input-name")!.addEventListener("input", (e) => {
  username.value = (e.target as HTMLInputElement).value;
});

let renderCount = 0;
effect(() => {
  document.getElementById("demo-count")!.textContent = `${clicks.value}  (doble: ${doubledClicks.value})`;
});
effect(() => {
  document.getElementById("demo-message")!.textContent = message.value;
});
effect(() => {
  clicks.value;
  renderCount++;
  document.getElementById("demo-log")!.textContent = `El DOM se ha actualizado ${renderCount} veces`;
});


// ══════════════════════════════════════════════════════════════
//  FASE 2: Template Engine
//  Tests → #tests2 | Summary → #summary2 | Demo → #demo2
// ══════════════════════════════════════════════════════════════

const testsF2 = document.getElementById("tests2")!;
let passedF2 = 0;
let failedF2 = 0;

function groupF2(name: string): void {
  const el = document.createElement("div");
  el.className = "test-group";
  el.textContent = name;
  testsF2.appendChild(el);
}

function assertF2(condition: boolean, description: string): void {
  const el = document.createElement("div");
  el.className = `test-line ${condition ? "pass" : "fail"}`;
  el.textContent = `${condition ? "✅" : "❌"} ${description}`;
  testsF2.appendChild(el);
  if (condition) { passedF2++; } else { failedF2++; console.error(`❌ FALLÓ F2: ${description}`); }
}

/** Crea un div sandbox invisible para montar templates de test. */
function sandbox(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}

// ── Test 1: Template estático ─────────────────────────────────────────────────
groupF2("html`` — 1. Template estático");
{
  const el = sandbox();
  html`<p>Hola mundo</p>`.mount(el);
  assertF2(el.children.length === 1, "Hay exactamente 1 elemento hijo");
  assertF2(el.children[0].tagName === "P", "El hijo es un <p>");
  assertF2(el.children[0].textContent === "Hola mundo", "Texto: 'Hola mundo'");
}

// ── Test 2: Texto reactivo ────────────────────────────────────────────────────
groupF2("html`` — 2. Texto reactivo");
{
  const el = sandbox();
  const n = signal("Nix");
  html`<p>Hola ${() => n.value}</p>`.mount(el);
  const p = el.querySelector("p")!;
  assertF2(p.textContent === "Hola Nix", "Texto inicial: 'Hola Nix'");
  n.value = "Mundo";
  assertF2(p.textContent === "Hola Mundo", "Texto actualizado: 'Hola Mundo'");
  n.value = "JS";
  assertF2(p.textContent === "Hola JS", "Segunda actualización: 'Hola JS'");
}

// ── Test 3: Valor estático interpolado ───────────────────────────────────────
groupF2("html`` — 3. Valor estático interpolado");
{
  const el = sandbox();
  const version = "1.0.0";
  html`<span>v${version}</span>`.mount(el);
  assertF2(el.querySelector("span")!.textContent === "v1.0.0", "Texto estático interpolado: 'v1.0.0'");
}

// ── Test 4: Eventos ───────────────────────────────────────────────────────────
groupF2("html`` — 4. Eventos (@event)");
{
  const el = sandbox();
  let clicks2 = 0;
  html`<button @click=${() => clicks2++}>+</button>`.mount(el);
  const btn = el.querySelector("button")!;
  assertF2(clicks2 === 0, "Sin clicks inicialmente");
  btn.click();
  assertF2(clicks2 === 1, "Un click → 1");
  btn.click(); btn.click();
  assertF2(clicks2 === 3, "Tres clicks → 3");
}

// ── Test 5: Atributos reactivos ───────────────────────────────────────────────
groupF2("html`` — 5. Atributos reactivos");
{
  const el = sandbox();
  const color = signal("red");
  html`<div class="${() => color.value}"></div>`.mount(el);
  const div = el.querySelector("div")!;
  assertF2(div.getAttribute("class") === "red", "class inicial: 'red'");
  color.value = "blue";
  assertF2(div.getAttribute("class") === "blue", "class → 'blue'");
  color.value = "green";
  assertF2(div.getAttribute("class") === "green", "class → 'green'");
}

// ── Test 5b: Atributo null → removeAttribute ─────────────────────────────────
groupF2("html`` — 5b. Atributo null → removeAttribute");
{
  const el = sandbox();
  const active = signal(true);
  html`<div title="${() => active.value ? "activo" : null}"></div>`.mount(el);
  const div = el.querySelector("div")!;
  assertF2(div.getAttribute("title") === "activo", "title='activo' cuando true");
  active.value = false;
  assertF2(!div.hasAttribute("title"), "title removido cuando null");
}

// ── Test 6: Condicional ───────────────────────────────────────────────────────
groupF2("html`` — 6. Condicional (() => template | null)");
{
  const el = sandbox();
  const show = signal(true);
  html`<div>${() => show.value ? html`<p class="vis">Visible</p>` : null}</div>`.mount(el);
  const container = el.querySelector("div")!;
  assertF2(container.querySelector(".vis") !== null, "show=true → existe");
  show.value = false;
  assertF2(container.querySelector(".vis") === null, "show=false → eliminado");
  show.value = true;
  assertF2(container.querySelector(".vis") !== null, "show=true → vuelve a existir");
}

// ── Test 7: Condicional entre dos templates ───────────────────────────────────
groupF2("html`` — 7. Condicional entre dos templates");
{
  const el = sandbox();
  const page = signal<"home" | "about">("home");
  html`<main>${() =>
    page.value === "home"
      ? html`<h1 id="t7-home">Inicio</h1>`
      : html`<h1 id="t7-about">About</h1>`
    }</main>`.mount(el);
  assertF2(el.querySelector("#t7-home") !== null, "page=home → #t7-home existe");
  assertF2(el.querySelector("#t7-about") === null, "page=home → #t7-about no existe");
  page.value = "about";
  assertF2(el.querySelector("#t7-home") === null, "page=about → #t7-home eliminado");
  assertF2(el.querySelector("#t7-about") !== null, "page=about → #t7-about existe");
}

// ── Test 8: Lista ─────────────────────────────────────────────────────────────
groupF2("html`` — 8. Lista (() => NixTemplate[])");
{
  const el = sandbox();
  const items2 = signal(["A", "B", "C"]);
  html`<ul>${() => items2.value.map((item) => html`<li>${item}</li>`)}</ul>`.mount(el);
  const ul = el.querySelector("ul")!;
  assertF2(ul.querySelectorAll("li").length === 3, "3 elementos inicialmente");
  assertF2(ul.querySelectorAll("li")[0].textContent === "A", "Primer item: 'A'");
  assertF2(ul.querySelectorAll("li")[2].textContent === "C", "Tercer item: 'C'");
  items2.value = ["X", "Y"];
  assertF2(ul.querySelectorAll("li").length === 2, "Actualización: 2 elementos");
  assertF2(ul.querySelectorAll("li")[0].textContent === "X", "Primer item: 'X'");
  items2.value = [];
  assertF2(ul.querySelectorAll("li").length === 0, "Lista vacía: 0 elementos");
  items2.value = ["1", "2", "3", "4"];
  assertF2(ul.querySelectorAll("li").length === 4, "Expansión: 4 elementos");
}

// ── Test 9: Template anidado estático ────────────────────────────────────────
groupF2("html`` — 9. Template anidado (componente)");
{
  function Badge(props: { text: string }) {
    return html`<span class="badge">${props.text}</span>`;
  }
  const el = sandbox();
  html`<div>${Badge({ text: "Nix" })}</div>`.mount(el);
  const div = el.querySelector("div")!;
  assertF2(div.querySelector(".badge") !== null, "<span.badge> existe dentro del <div>");
  assertF2(div.querySelector(".badge")!.textContent === "Nix", "Texto del badge: 'Nix'");
}

// ── Test 10: Computed dentro de template ─────────────────────────────────────
groupF2("html`` — 10. Computed reactivo en template");
{
  const el = sandbox();
  const n2 = signal(3);
  const dbl = computed(() => n2.value * 2);
  html`<p>${() => n2.value} × 2 = ${() => dbl.value}</p>`.mount(el);
  const p = el.querySelector("p")!;
  assertF2(p.textContent === "3 × 2 = 6", "Texto inicial: '3 × 2 = 6'");
  n2.value = 5;
  assertF2(p.textContent === "5 × 2 = 10", "Actualizado: '5 × 2 = 10'");
}

// ── Test 11: unmount limpia efectos ──────────────────────────────────────────
groupF2("html`` — 11. unmount() limpia efectos");
{
  const el = sandbox();
  const ticker = signal(0);
  let renders = 0;
  const handle = html`<span>${() => { renders++; return ticker.value; }}</span>`.mount(el);
  renders = 0;
  ticker.value = 1;
  assertF2(renders === 1, "Antes de unmount: se re-renderiza");
  handle.unmount();
  renders = 0;
  ticker.value = 2;
  assertF2(renders === 0, "Después de unmount: NO se re-renderiza");
  assertF2(el.querySelector("span") === null, "El <span> fue removido del DOM");
}

// ── Test 12: batch con template ──────────────────────────────────────────────
groupF2("html`` — 12. batch agrupa actualizaciones");
{
  const el = sandbox();
  const a = signal(1);
  const b = signal(2);
  let renderCount2 = 0;
  html`<p>${() => { renderCount2++; return `${a.value}+${b.value}=${a.value + b.value}`; }}</p>`.mount(el);
  renderCount2 = 0;
  batch(() => { a.value = 10; b.value = 20; });
  assertF2(renderCount2 === 1, "batch: 2 cambios = 1 sola re-renderización");
  assertF2(el.querySelector("p")!.textContent === "10+20=30", "Resultado correcto: '10+20=30'");
}

// ── Resumen F2 ────────────────────────────────────────────────────────────────
const summaryF2 = document.getElementById("summary2")!;
const allPassedF2 = failedF2 === 0;
summaryF2.innerHTML = `
  <div class="summary ${allPassedF2 ? "all-pass" : "has-fail"}">
    ${allPassedF2 ? "🎉" : "⚠️"} ${passedF2} pasaron, ${failedF2} fallaron
    ${allPassedF2 ? " — ¡Template Engine funcionando!" : ""}
  </div>
`;

// ── Demo Interactivo F2 ───────────────────────────────────────────────────────
const demoF2 = document.getElementById("demo2")!;

function Counter(props: { initial?: number; label?: string } = {}) {
  const c = signal(props.initial ?? 0);
  const dbl = computed(() => c.value * 2);
  return html`
    <div class="widget">
      <div class="widget-label">${props.label ?? "Contador"}</div>
      <div class="counter-value">${() => c.value}</div>
      <div class="counter-meta">doble: ${() => dbl.value}</div>
      <div class="demo-row">
        <button @click=${() => c.update((n) => n - 1)}>−</button>
        <button @click=${() => c.update((n) => n + 1)}>+</button>
        <button @click=${() => (c.value = 0)}>Reset</button>
      </div>
    </div>
  `;
}

function TodoList() {
  const todos = signal<string[]>(["Construir Fase 2", "Probar html``"]);
  const inputVal = signal("");

  function addTodo() {
    const t = inputVal.value.trim();
    if (!t) return;
    todos.update((prev) => [...prev, t]);
    inputVal.value = "";
    const inputEl = document.getElementById("todo-input") as HTMLInputElement | null;
    if (inputEl) inputEl.value = "";
  }

  return html`
    <div class="widget">
      <div class="widget-label">
        Lista de tareas
        <span class="badge-count">${() => todos.value.length}</span>
      </div>
      <div class="demo-row">
        <input
          id="todo-input"
          type="text"
          placeholder="Nueva tarea..."
          @input=${(e: Event) => (inputVal.value = (e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => e.key === "Enter" && addTodo()}
        />
        <button @click=${addTodo}>Agregar</button>
      </div>
      <ul class="todo-list">
        ${() => todos.value.map((todo, i) => html`
          <li class="todo-item">
            <span>${todo}</span>
            <button class="btn-remove" @click=${() => todos.update((arr) => arr.filter((_, j) => j !== i))}>✕</button>
          </li>
        `)}
      </ul>
      ${() => todos.value.length === 0 ? html`<p class="empty-msg">Sin tareas pendientes ✓</p>` : null}
    </div>
  `;
}

function ToggleTabs() {
  const show = signal(true);
  const page = signal<"A" | "B" | "C">("A");
  return html`
    <div class="widget">
      <div class="widget-label">Condicional + Tabs</div>
      <div class="demo-row">
        <button @click=${() => show.update((v) => !v)}>
          ${() => (show.value ? "Ocultar" : "Mostrar")}
        </button>
      </div>
      ${() => show.value ? html`
        <div>
          <div class="demo-row">
            <button @click=${() => (page.value = "A")}>Tab A</button>
            <button @click=${() => (page.value = "B")}>Tab B</button>
            <button @click=${() => (page.value = "C")}>Tab C</button>
          </div>
          ${() => {
        switch (page.value) {
          case "A": return html`<p class="tab-content">❄️ Contenido de Tab A</p>`;
          case "B": return html`<p class="tab-content">🌊 Contenido de Tab B</p>`;
          case "C": return html`<p class="tab-content">🔥 Contenido de Tab C</p>`;
        }
      }}
        </div>
      ` : null}
    </div>
  `;
}

html`
  <div class="demo-app">
    <div class="demo-grid">
      ${Counter({ initial: 0, label: "Counter A" })}
      ${Counter({ initial: 10, label: "Counter B" })}
    </div>
    ${ToggleTabs()}
    ${TodoList()}
  </div>
`.mount(demoF2);


// ══════════════════════════════════════════════════════════════
//  FASE 3: Componentes + mount()
//  Tests → #tests3 | Summary → #summary3 | Demo → #demo3
// ══════════════════════════════════════════════════════════════

import { mount } from "./nix";

const testsF3 = document.getElementById("tests3")!;
let passedF3 = 0;
let failedF3 = 0;

function groupF3(name: string): void {
  const el = document.createElement("div");
  el.className = "test-group";
  el.textContent = name;
  testsF3.appendChild(el);
}

function assertF3(condition: boolean, description: string): void {
  const el = document.createElement("div");
  el.className = `test-line ${condition ? "pass" : "fail"}`;
  el.textContent = `${condition ? "✅" : "❌"} ${description}`;
  testsF3.appendChild(el);
  if (condition) { passedF3++; } else { failedF3++; console.error(`❌ FALLÓ F3: ${description}`); }
}

function sandbox3(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.display = "none";
  document.body.appendChild(el);
  return el;
}

// ── Test 1: Componente simple ────────────────────────────────────────────────
groupF3("Componentes — 1. Componente simple (función → html``)");
{
  function Greeting(props: { name: string }) {
    return html`<h2>Hola ${props.name}!</h2>`;
  }

  const el = sandbox3();
  mount(Greeting({ name: "Nix" }), el);

  assertF3(el.querySelector("h2") !== null, "<h2> existe en el DOM");
  assertF3(el.querySelector("h2")!.textContent === "Hola Nix!", "Texto: 'Hola Nix!'");
}

// ── Test 2: Props estáticos ──────────────────────────────────────────────────
groupF3("Componentes — 2. Props estáticos");
{
  function Badge(props: { text: string; color?: string }) {
    const cls = `badge-${props.color ?? "blue"}`;
    return html`<span class="${cls}">${props.text}</span>`;
  }

  const el = sandbox3();
  mount(
    html`<div>
      ${Badge({ text: "v1.0", color: "green" })}
      ${Badge({ text: "beta" })}
    </div>`,
    el
  );

  assertF3(el.querySelector(".badge-green") !== null, "Badge verde existe");
  assertF3(el.querySelector(".badge-green")!.textContent === "v1.0", "Texto: 'v1.0'");
  assertF3(el.querySelector(".badge-blue") !== null, "Badge azul (default) existe");
  assertF3(el.querySelector(".badge-blue")!.textContent === "beta", "Texto: 'beta'");
}

// ── Test 3: Componente con estado interno ────────────────────────────────────
groupF3("Componentes — 3. Estado interno (signal local)");
{
  function Counter3(props: { initial: number }) {
    const c = signal(props.initial);
    return html`
      <div>
        <span id="c3-val">${() => c.value}</span>
        <button id="c3-btn" @click=${() => c.update((n) => n + 1)}>+</button>
      </div>
    `;
  }

  const el = sandbox3();
  mount(Counter3({ initial: 7 }), el);

  assertF3(el.querySelector("#c3-val")!.textContent === "7", "Valor inicial: 7");
  (el.querySelector("#c3-btn") as HTMLButtonElement).click();
  assertF3(el.querySelector("#c3-val")!.textContent === "8", "Tras click: 8");
  (el.querySelector("#c3-btn") as HTMLButtonElement).click();
  assertF3(el.querySelector("#c3-val")!.textContent === "9", "Tras 2 clicks: 9");
}

// ── Test 4: Composición (componentes dentro de otros) ────────────────────────
groupF3("Componentes — 4. Composición simple");
{
  function Header4(props: { title: string }) {
    return html`<header><h1 id="t4-title">${props.title}</h1></header>`;
  }

  function Footer4() {
    return html`<footer id="t4-footer">Nix.js ❄️</footer>`;
  }

  function App4() {
    return html`
      <div>
        ${Header4({ title: "Mi App" })}
        <main id="t4-main">Contenido</main>
        ${Footer4()}
      </div>
    `;
  }

  const el = sandbox3();
  mount(App4(), el);

  assertF3(el.querySelector("#t4-title") !== null, "<h1#t4-title> existe");
  assertF3(el.querySelector("#t4-title")!.textContent === "Mi App", "Título: 'Mi App'");
  assertF3(el.querySelector("#t4-main") !== null, "<main> existe");
  assertF3(el.querySelector("#t4-footer") !== null, "<footer> existe");
}

// ── Test 5: Props reactivos (signal como prop) ───────────────────────────────
groupF3("Componentes — 5. Props reactivos (Signal como prop)");
{
  function Display5(props: { count: ReturnType<typeof signal<number>> }) {
    const dbl = computed(() => props.count.value * 2);
    return html`
      <p>
        <span id="t5-val">${() => props.count.value}</span>
        &nbsp;×2=&nbsp;
        <span id="t5-dbl">${() => dbl.value}</span>
      </p>
    `;
  }

  const sharedCount = signal(3);
  const el = sandbox3();
  mount(
    html`<div>
      ${Display5({ count: sharedCount })}
      <button id="t5-btn" @click=${() => sharedCount.update((n) => n + 1)}>+</button>
    </div>`,
    el
  );

  assertF3(el.querySelector("#t5-val")!.textContent === "3", "Valor inicial: 3");
  assertF3(el.querySelector("#t5-dbl")!.textContent === "6", "Doble inicial: 6");
  (el.querySelector("#t5-btn") as HTMLButtonElement).click();
  assertF3(el.querySelector("#t5-val")!.textContent === "4", "Tras click: 4");
  assertF3(el.querySelector("#t5-dbl")!.textContent === "8", "Doble reactivo: 8");
}

// ── Test 6: Componente condicional ───────────────────────────────────────────
groupF3("Componentes — 6. Componente condicional");
{
  function Welcome6() {
    return html`<p id="t6-welcome">Bienvenido</p>`;
  }
  function Hidden6() {
    return html`<p id="t6-hidden">Oculto</p>`;
  }

  const visible = signal(true);
  const el = sandbox3();
  mount(
    html`<div>${() => visible.value ? Welcome6() : Hidden6()}</div>`,
    el
  );

  assertF3(el.querySelector("#t6-welcome") !== null, "visible=true → Welcome existe");
  assertF3(el.querySelector("#t6-hidden") === null, "visible=true → Hidden no existe");

  visible.value = false;
  assertF3(el.querySelector("#t6-welcome") === null, "visible=false → Welcome eliminado");
  assertF3(el.querySelector("#t6-hidden") !== null, "visible=false → Hidden aparece");

  visible.value = true;
  assertF3(el.querySelector("#t6-welcome") !== null, "visible=true → Welcome vuelve");
}

// ── Test 7: Lista de componentes ─────────────────────────────────────────────
groupF3("Componentes — 7. Lista de componentes");
{
  function Item7(props: { text: string; onRemove: () => void }) {
    return html`
      <li class="t7-item">
        <span>${props.text}</span>
        <button class="t7-rm" @click=${props.onRemove}>✕</button>
      </li>
    `;
  }

  const items7 = signal(["Alfa", "Beta", "Gamma"]);
  const el = sandbox3();
  mount(
    html`<ul>${() =>
      items7.value.map((text, i) =>
        Item7({
          text,
          onRemove: () => items7.update((arr) => arr.filter((_, j) => j !== i)),
        })
      )
      }</ul>`,
    el
  );

  assertF3(el.querySelectorAll(".t7-item").length === 3, "3 items inicialmente");
  assertF3(el.querySelectorAll(".t7-item")[0].textContent?.includes("Alfa") ?? false, "Primer item: 'Alfa'");

  // Remover el primer item
  (el.querySelectorAll(".t7-rm")[0] as HTMLButtonElement).click();
  assertF3(el.querySelectorAll(".t7-item").length === 2, "Tras remove: 2 items");
  assertF3(el.querySelectorAll(".t7-item")[0].textContent?.includes("Beta") ?? false, "Ahora primero: 'Beta'");

  // Agregar item desde signal
  items7.update((arr) => [...arr, "Delta"]);
  assertF3(el.querySelectorAll(".t7-item").length === 3, "Tras push: 3 items");
}

// ── Test 8: mount() global devuelve unmount() funcional ─────────────────────
groupF3("Componentes — 8. mount() global → unmount() limpia");
{
  const ticker3 = signal(0);
  let renders3 = 0;

  function Ticker8() {
    return html`<span id="t8-ticker">${() => { renders3++; return ticker3.value; }}</span>`;
  }

  const el = sandbox3();
  const handle = mount(Ticker8(), el);

  renders3 = 0;
  ticker3.value = 1;
  assertF3(renders3 === 1, "Antes de unmount: re-renders al cambiar signal");
  assertF3(el.querySelector("#t8-ticker")!.textContent === "1", "DOM actualizado: '1'");

  handle.unmount();
  renders3 = 0;
  ticker3.value = 2;
  assertF3(renders3 === 0, "Después de unmount: NO re-renders");
  assertF3(el.querySelector("#t8-ticker") === null, "Nodo removido del DOM");
}

// ── Test 9: Dos instancias del mismo componente tienen estado independiente ──
groupF3("Componentes — 9. Instancias independientes");
{
  // NOTA: los IDs se calculan ANTES del template — el engine solo soporta
  // interpolaciones que ocupan el valor COMPLETO de un atributo.
  function Counter9(props: { id: string }) {
    const c = signal(0);
    const idVal = `${props.id}-val`;
    const idBtn = `${props.id}-btn`;
    return html`
      <div>
        <span id="${idVal}">${() => c.value}</span>
        <button id="${idBtn}" @click=${() => c.update((n) => n + 1)}>+</button>
      </div>
    `;
  }

  const el = sandbox3();
  mount(
    html`<div>${Counter9({ id: "ca" })}${Counter9({ id: "cb" })}</div>`,
    el
  );

  assertF3(el.querySelector("#ca-val")!.textContent === "0", "Counter A inicial: 0");
  assertF3(el.querySelector("#cb-val")!.textContent === "0", "Counter B inicial: 0");

  (el.querySelector("#ca-btn") as HTMLButtonElement).click();
  (el.querySelector("#ca-btn") as HTMLButtonElement).click();
  assertF3(el.querySelector("#ca-val")!.textContent === "2", "Counter A: 2");
  assertF3(el.querySelector("#cb-val")!.textContent === "0", "Counter B sigue en 0 (independiente)");

  (el.querySelector("#cb-btn") as HTMLButtonElement).click();
  assertF3(el.querySelector("#ca-val")!.textContent === "2", "Counter A sigue en 2");
  assertF3(el.querySelector("#cb-val")!.textContent === "1", "Counter B: 1");
}

// ── Resumen F3 ────────────────────────────────────────────────────────────────
const summaryF3 = document.getElementById("summary3")!;
const allPassedF3 = failedF3 === 0;
summaryF3.innerHTML = `
  <div class="summary ${allPassedF3 ? "all-pass" : "has-fail"}">
    ${allPassedF3 ? "🎉" : "⚠️"} ${passedF3} pasaron, ${failedF3} fallaron
    ${allPassedF3 ? " — ¡Componentes funcionando!" : ""}
  </div>
`;

// ── Demo Interactivo F3 ───────────────────────────────────────────────────────
const demoF3 = document.getElementById("demo3")!;

// Componentes del demo
function DHeader(props: { title: string }) {
  return html`
    <div class="widget" style="background:#111">
      <div class="widget-label">Header</div>
      <div style="font-size:20px;font-weight:700;color:#e5e5e5">${props.title}</div>
    </div>
  `;
}

function DCounter(props: { initial?: number; label?: string; sharedTotal?: ReturnType<typeof signal<number>> }) {
  const c = signal(props.initial ?? 0);
  // Si recibe un signal compartido, lo actualiza también
  const dbl = computed(() => c.value * 2);
  return html`
    <div class="widget">
      <div class="widget-label">${props.label ?? "Counter"}</div>
      <div class="counter-value">${() => c.value}</div>
      <div class="counter-meta">doble: ${() => dbl.value}</div>
      <div class="demo-row">
        <button @click=${() => c.update((n) => n - 1)}>−</button>
        <button @click=${() => c.update((n) => n + 1)}>+</button>
        <button @click=${() => { c.value = 0; }}>Reset</button>
      </div>
    </div>
  `;
}

function DDisplay(props: { count: ReturnType<typeof signal<number>> }) {
  const tripled = computed(() => props.count.value * 3);
  return html`
    <div class="widget">
      <div class="widget-label">Display (props reactivos)</div>
      <div class="counter-meta">Recibe el signal directamente:</div>
      <div style="font-size:24px;font-weight:700;color:#a78bfa">
        ${() => props.count.value} × 3 = ${() => tripled.value}
      </div>
    </div>
  `;
}

function DItem(props: { text: string; onRemove: () => void }) {
  return html`
    <li class="todo-item">
      <span>${props.text}</span>
      <button class="btn-remove" @click=${props.onRemove}>✕</button>
    </li>
  `;
}

function DTodoList() {
  const todos = signal(["Fase 1 ✅", "Fase 2 ✅", "Fase 3 ✅"]);
  const inp = signal("");

  function add() {
    const t = inp.value.trim();
    if (!t) return;
    todos.update((arr) => [...arr, t]);
    inp.value = "";
    const el = document.getElementById("d3-input") as HTMLInputElement | null;
    if (el) el.value = "";
  }

  return html`
    <div class="widget">
      <div class="widget-label">
        Fase Log
        <span class="badge-count">${() => todos.value.length}</span>
      </div>
      <div class="demo-row">
        <input id="d3-input" type="text" placeholder="Agregar fase..."
          @input=${(e: Event) => (inp.value = (e.target as HTMLInputElement).value)}
          @keydown=${(e: KeyboardEvent) => e.key === "Enter" && add()}
        />
        <button @click=${add}>+</button>
      </div>
      <ul class="todo-list">
        ${() => todos.value.map((text, i) =>
    DItem({
      text,
      onRemove: () => todos.update((arr) => arr.filter((_, j) => j !== i)),
    })
  )}
      </ul>
    </div>
  `;
}

function DApp() {
  const sharedCount = signal(0);
  const showDisplay = signal(true);

  return html`
    <div class="demo-app">
      ${DHeader({ title: "❄️ Nix.js — App de Componentes" })}
      <div class="demo-grid">
        ${DCounter({ initial: 0, label: "Counter Maestro" })}
        ${html`
          <div class="widget" style="display:flex;flex-direction:column;gap:12px">
            <div class="widget-label">Signal compartido</div>
            <div class="counter-value">${() => sharedCount.value}</div>
            <div class="demo-row">
              <button @click=${() => sharedCount.update((n) => n - 1)}>−</button>
              <button @click=${() => sharedCount.update((n) => n + 1)}>+</button>
            </div>
            <button @click=${() => showDisplay.update((v) => !v)} style="margin-top:4px">
              ${() => showDisplay.value ? "Ocultar Display" : "Mostrar Display"}
            </button>
          </div>
        `}
      </div>
      ${() => showDisplay.value ? DDisplay({ count: sharedCount }) : null}
      ${DTodoList()}
    </div>
  `;
}

mount(DApp(), demoF3);

// ══════════════════════════════════════════════════════════════
//  FASE 4: Lifecycle Hooks (Clases — Opción A)
//  Tests → #tests4 | Summary → #summary4 | Demo → #demo4
// ══════════════════════════════════════════════════════════════

import { NixComponent } from "./nix";

let passedF4 = 0;
let failedF4 = 0;
const testsContainerF4 = document.getElementById("tests4")!;

function groupF4(name: string) {
  const h = document.createElement("h3");
  h.textContent = name;
  h.style.color = "#7dd3fc";
  h.style.marginTop = "1rem";
  testsContainerF4.appendChild(h);
}

function assertF4(condition: boolean, label: string) {
  passedF4 += condition ? 1 : 0;
  failedF4 += condition ? 0 : 1;
  const li = document.createElement("div");
  li.className = `test-item ${condition ? "pass" : "fail"}`;
  li.textContent = `${condition ? "✅" : "❌"} ${label}`;
  testsContainerF4.appendChild(li);
}

function sandbox4(): HTMLDivElement {
  return document.createElement("div");
}

// ── Test 1: onMount se ejecuta tras inserción en el DOM ──────────────────────
groupF4("Lifecycle — 1. onMount se ejecuta tras mount()");
{
  class Comp1 extends NixComponent {
    fired = false;
    override onMount() { this.fired = true; }
    render() { return html`<span>Comp1</span>`; }
  }
  const c1 = new Comp1();
  assertF4(!c1.fired, "Antes de mount: NO ha disparado");
  mount(c1, sandbox4());
  assertF4(c1.fired, "Después de mount: disparado ✓");
}

// ── Test 2: onMount NO se ejecuta si la instancia no se monta ─────────────
groupF4("Lifecycle — 2. onMount no dispara si la instancia no se monta");
{
  class Comp2 extends NixComponent {
    fired = false;
    override onMount() { this.fired = true; }
    render() { return html`<span>Comp2</span>`; }
  }
  const c2 = new Comp2();
  assertF4(!c2.fired, "Instancia creada sin montar: onMount NO disparó");
}

// ── Test 3: cleanup devuelto por onMount se llama al desmontar ────────────
groupF4("Lifecycle — 3. Cleanup devuelto por onMount se ejecuta al desmontar");
{
  class Comp3 extends NixComponent {
    mounted = false;
    cleaned = false;
    override onMount() {
      this.mounted = true;
      return () => { this.cleaned = true; };
    }
    render() { return html`<span>Comp3</span>`; }
  }
  const c3 = new Comp3();
  const h3 = mount(c3, sandbox4());
  assertF4(c3.mounted && !c3.cleaned, "Tras mount: montado=true, cleanup=false");
  h3.unmount();
  assertF4(c3.cleaned, "Tras unmount: cleanup de onMount ejecutado");
}

// ── Test 4: onUnmount explícito se ejecuta al desmontar ─────────────────
groupF4("Lifecycle — 4. onUnmount explícito");
{
  class Comp4 extends NixComponent {
    log = "";
    override onMount() { this.log += "M"; }
    override onUnmount() { this.log += "U"; }
    render() { return html`<span>Comp4</span>`; }
  }
  const c4 = new Comp4();
  const h4 = mount(c4, sandbox4());
  assertF4(c4.log === "M", "Tras mount: solo 'M'");
  h4.unmount();
  assertF4(c4.log === "MU", "Tras unmount: 'MU'");
}

// ── Test 5: onError captura errores lanzados en onMount ────────────────
groupF4("Lifecycle — 5. onError captura error lanzado en onMount");
{
  class Comp5 extends NixComponent {
    errors: string[] = [];
    override onError(e: unknown) { this.errors.push((e as Error).message); }
    override onMount() { throw new Error("fallo en mount"); }
    render() { return html`<span id="c5-alive">presente</span>`; }
  }
  const el5 = sandbox4();
  const c5 = new Comp5();
  mount(c5, el5);
  assertF4(c5.errors[0] === "fallo en mount", "onError capturó el mensaje correcto");
  assertF4(el5.querySelector("#c5-alive")?.textContent === "presente", "Componente sigue en el DOM");
}

// ── Test 6: NixComponent como valor estático en html`` ─────────────────
groupF4("Lifecycle — 6. NixComponent como valor estático en html`");
{
  class Badge6 extends NixComponent {
    private text: string;
    constructor(text: string) { super(); this.text = text; }
    render() { return html`<span class="b6">${this.text}</span>`; }
  }
  const el6 = sandbox4();
  mount(html`<div>${new Badge6("Hola")}</div>`, el6);
  assertF4(el6.querySelector(".b6")?.textContent === "Hola", "Renderiza como valor embebido en template");
}

// ── Test 7: onMount dispara para NixComponent embebido inline ───────────
groupF4("Lifecycle — 7. onMount dispara para NixComponent embebido inline");
{
  class WithMount7 extends NixComponent {
    fired = false;
    override onMount() { this.fired = true; }
    render() { return html`<span>7</span>`; }
  }
  const inst7 = new WithMount7();
  assertF4(!inst7.fired, "Antes de montar inline: no disparó");
  mount(html`<div>${inst7}</div>`, sandbox4());
  assertF4(inst7.fired, "Inline en template: onMount disparó");
}

// ── Test 8: Cleanup ejecutado al desmontar el template padre ────────────
groupF4("Lifecycle — 8. Cleanup ejecutado al desmontar el template padre");
{
  class WithCleanup8 extends NixComponent {
    cleaned = false;
    override onMount() { return () => { this.cleaned = true; }; }
    render() { return html`<span>8</span>`; }
  }
  const inst8 = new WithCleanup8();
  const h8 = mount(html`<div>${inst8}</div>`, sandbox4());
  assertF4(!inst8.cleaned, "Antes de unmount: no limpiado");
  h8.unmount();
  assertF4(inst8.cleaned, "Tras unmount del padre: cleanup ejecutado");
}

// ── Test 9: Instancias independientes tienen estado propio ──────────────
groupF4("Lifecycle — 9. Instancias independientes tienen estado propio");
{
  class Counter9 extends NixComponent {
    count = signal(0);
    render() {
      return html`<span class="c9">${() => this.count.value}</span>`;
    }
  }
  const a9 = new Counter9();
  const b9 = new Counter9();
  const el9 = sandbox4();
  mount(html`<div>${a9}${b9}</div>`, el9);
  a9.count.value = 5;
  const spans9 = el9.querySelectorAll(".c9");
  assertF4(spans9[0].textContent === "5", "Instancia A: count=5");
  assertF4(spans9[1].textContent === "0", "Instancia B sigue en 0 (independiente)");
}

// ── Test 10: onInit se ejecuta antes de render(), sin DOM ───────────────────
groupF4("Lifecycle — 10. onInit antes de render(), sin DOM");
{
  const order: string[] = [];
  class Comp10 extends NixComponent {
    derived = 0;
    override onInit() {
      order.push("init");
      this.derived = 42; // inicializar estado derivado
    }
    override onMount() { order.push("mount"); }
    render() {
      order.push("render");
      return html`<span class="c10">${this.derived}</span>`;
    }
  }
  const el10 = sandbox4();
  mount(new Comp10(), el10);
  assertF4(
    order[0] === "init" && order[1] === "render" && order[2] === "mount",
    `Orden correcto: ${order.join(" → ")}`
  );
  assertF4(
    el10.querySelector(".c10")?.textContent === "42",
    "Valor inicializado en onInit disponible en render()"
  );
}

// ── Test 11: onError captura errores de onInit ───────────────────────────────
groupF4("Lifecycle — 11. onError captura error en onInit");
{
  class Comp11 extends NixComponent {
    errors: string[] = [];
    override onError(e: unknown) { this.errors.push((e as Error).message); }
    override onInit() { throw new Error("fallo en init"); }
    render() { return html`<span id="c11-alive">presente</span>`; }
  }
  const el11 = sandbox4();
  const c11 = new Comp11();
  mount(c11, el11);
  assertF4(c11.errors[0] === "fallo en init", "onError capturó error de onInit");
  assertF4(el11.querySelector("#c11-alive")?.textContent === "presente", "DOM presente tras error capturado");
}

// ── Resumen F4 ────────────────────────────────────────────────────────────────────
const summaryF4 = document.getElementById("summary4")!;
const allPassedF4 = failedF4 === 0;
summaryF4.innerHTML = `
  <div class="summary ${allPassedF4 ? "all-pass" : "has-fail"}">
    ${allPassedF4 ? "🎉" : "⚠️"} ${passedF4} pasaron, ${failedF4} fallaron
    ${allPassedF4 ? " — ¡Lifecycle funcionando!" : ""}
  </div>
`;

// ── Demo Interactivo F4 ──────────────────────────────────────────────────────────────────
const demoF4 = document.getElementById("demo4")!;

// ─── Demo A: Cronómetro — setInterval en onMount, clearInterval en cleanup ───
class Stopwatch4 extends NixComponent {
  seconds = signal(0);
  running = signal(false);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private disposeSyncFn: (() => void) | null = null;

  override onMount() {
    this.disposeSyncFn = effect(() => {
      if (this.running.value) {
        this.intervalId = setInterval(() => this.seconds.update((n) => n + 1), 1000);
      } else {
        if (this.intervalId !== null) { clearInterval(this.intervalId); this.intervalId = null; }
      }
    });
    return () => {
      this.disposeSyncFn?.();
      if (this.intervalId !== null) clearInterval(this.intervalId);
    };
  }

  render() {
    return html`
      <div class="widget">
        <div class="widget-label">⏱ Cronómetro <small>(onMount + setInterval)</small></div>
        <div class="counter-value" style="font-size:2.5rem;margin:6px 0">
          ${() => this.seconds.value}<span style="font-size:1rem;opacity:.6">s</span>
        </div>
        <div style="display:flex;gap:8px">
          <button @click=${() => this.running.update((v) => !v)}>
            ${() => this.running.value ? "⏸ Pausar" : "▶ Iniciar"}
          </button>
          <button @click=${() => { this.running.value = false; this.seconds.value = 0; }}>
            ↺ Reset
          </button>
        </div>
      </div>
    `;
  }
}

// ─── Demo B: Log de lifecycle — onMount / onUnmount en tiempo real ──────────
const lifecycleLog4 = signal<string[]>([]);
let instanceId4 = 0;

class LogBox4 extends NixComponent {
  private num: number;
  constructor(num: number) { super(); this.num = num; }

  override onMount() {
    lifecycleLog4.update((arr) => [...arr, `🟢 Instancia #${this.num} montada`]);
    return () => {
      lifecycleLog4.update((arr) => [...arr, `🔴 Instancia #${this.num} desmontada`]);
    };
  }

  render() {
    return html`
      <div class="widget" style="padding:6px 12px;font-size:.9rem">
        Instancia #${this.num}
      </div>
    `;
  }
}

const activeInstances4 = signal<LogBox4[]>([]);

mount(
  html`
    <div class="demo-grid">
      <div>
        <div class="widget-label" style="margin-bottom:8px">
          🔬 Instancias con Lifecycle
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <button @click=${() => {
      instanceId4++;
      activeInstances4.update((arr) => [...arr, new LogBox4(instanceId4)]);
    }}>＋ Agregar</button>
          <button @click=${() =>
      activeInstances4.update((arr) => arr.slice(0, -1))
    }>− Quitar última</button>
          <button @click=${() => { lifecycleLog4.value = []; }}>🗑 Limpiar log</button>
        </div>
        ${() => activeInstances4.value}
      </div>
      <div>
        <div class="widget-label" style="margin-bottom:6px">📋 Log de eventos</div>
        <div style="font-family:monospace;font-size:.85rem;line-height:1.9">
          ${() =>
      lifecycleLog4.value.length === 0
        ? [html`<span style="opacity:.4">sin eventos aún…</span>`]
        : lifecycleLog4.value.map((line) => html`<div>${line}</div>`)
    }
        </div>
      </div>
    </div>
  `,
  demoF4
);

mount(new Stopwatch4(), demoF4);

// ══════════════════════════════════════════════════════════════
//  FASE 5: Global Stores
//  Tests → #tests5 | Summary → #summary5 | Demo → #demo5
// ══════════════════════════════════════════════════════════════

import { createStore } from "./nix";

let passedF5 = 0;
let failedF5 = 0;
const testsContainerF5 = document.getElementById("tests5")!;

function groupF5(name: string) {
  const h = document.createElement("h3");
  h.textContent = name;
  h.style.color = "#7dd3fc";
  h.style.marginTop = "1rem";
  testsContainerF5.appendChild(h);
}

function assertF5(condition: boolean, label: string) {
  passedF5 += condition ? 1 : 0;
  failedF5 += condition ? 0 : 1;
  const li = document.createElement("div");
  li.className = `test-item ${condition ? "pass" : "fail"}`;
  li.textContent = `${condition ? "✅" : "❌"} ${label}`;
  testsContainerF5.appendChild(li);
}

// ── Test 1: createStore devuelve signals por cada propiedad ──────────────────
groupF5("Store — 1. Signals creados por cada propiedad");
{
  const s1 = createStore({ count: 0, name: "Nix" });
  assertF5(s1.count.value === 0, "count inicial: 0");
  assertF5(s1.name.value === "Nix", "name inicial: 'Nix'");
  s1.count.value = 5;
  assertF5(s1.count.value === 5, "count tras asignación: 5");
}

// ── Test 2: effect rastrea cambios en el store ───────────────────────────────
groupF5("Store — 2. effect rastrea cambios en el store");
{
  const s2 = createStore({ x: 10 });
  let captured = -1;
  const dispose = effect(() => { captured = s2.x.value; });
  assertF5(captured === 10, "effect inicial: 10");
  s2.x.value = 99;
  assertF5(captured === 99, "effect tras cambio: 99");
  dispose();
  s2.x.value = 0;
  assertF5(captured === 99, "tras dispose: no re-ejecuta");
}

// ── Test 3: computed sobre el store ─────────────────────────────────────────
groupF5("Store — 3. computed sobre el store");
{
  const s3 = createStore({ price: 100, qty: 3 });
  const total = computed(() => s3.price.value * s3.qty.value);
  assertF5(total.value === 300, "total inicial: 300");
  s3.qty.value = 5;
  assertF5(total.value === 500, "total tras qty=5: 500");
  s3.price.value = 50;
  assertF5(total.value === 250, "total tras price=50: 250");
}

// ── Test 4: $reset restaura valores iniciales ────────────────────────────────
groupF5("Store — 4. $reset restaura valores iniciales");
{
  const s4 = createStore({ a: 1, b: "hola", c: true as boolean });
  s4.a.value = 99;
  s4.b.value = "adios";
  s4.c.value = false;
  s4.$reset();
  assertF5(s4.a.value === 1, "a reset: 1");
  assertF5(s4.b.value === "hola", "b reset: 'hola'");
  assertF5((s4.c.value as boolean) === true, "c reset: true");
}

// ── Test 5: acciones ─────────────────────────────────────────────────────────
groupF5("Store — 5. Acciones");
{
  const s5 = createStore(
    { count: 0 },
    (s) => ({
      increment: () => s.count.update((n) => n + 1),
      add: (n: number) => s.count.update((c) => c + n),
      reset: () => s5.$reset(),
    })
  );
  s5.increment();
  s5.increment();
  assertF5(s5.count.value === 2, "increment x2: 2");
  s5.add(8);
  assertF5(s5.count.value === 10, "add(8): 10");
  s5.reset();
  assertF5(s5.count.value === 0, "reset(): 0");
}

// ── Test 6: store compartido entre dos componentes ────────────────────────────
groupF5("Store — 6. Store compartido entre componentes");
{
  const shared = createStore({ value: 42 });

  class Reader6 extends NixComponent {
    render() {
      return html`<span class="r6">${() => shared.value.value}</span>`;
    }
  }

  const el6 = document.createElement("div");
  mount(html`<div>${new Reader6()}${new Reader6()}</div>`, el6);
  const spans6 = el6.querySelectorAll(".r6");
  assertF5(spans6[0].textContent === "42" && spans6[1].textContent === "42", "Ambos leen 42");

  shared.value.value = 7;
  assertF5(spans6[0].textContent === "7" && spans6[1].textContent === "7", "Ambos reaccionan: 7");
}

// ── Test 7: batch con store ───────────────────────────────────────────────────
groupF5("Store — 7. batch agrupa notificaciones del store");
{
  const s7 = createStore({ a: 0, b: 0 });
  let runs = 0;
  const dispose = effect(() => {
    s7.a.value; s7.b.value;
    runs++;
  });
  runs = 0;
  batch(() => {
    s7.a.value = 1;
    s7.b.value = 2;
  });
  assertF5(runs === 1, `batch: solo 1 re-ejecución (runs=${runs})`);
  dispose();
}

// ── Test 8: store con array — update no muta el original ─────────────────────
groupF5("Store — 8. Store con array (inmutabilidad)");
{
  const s8 = createStore({ items: [] as string[] });
  s8.items.update((arr) => [...arr, "A"]);
  s8.items.update((arr) => [...arr, "B"]);
  assertF5(s8.items.value.length === 2, "length: 2");
  assertF5(s8.items.value[1] === "B", "segundo item: 'B'");
  s8.$reset();
  assertF5(s8.items.value.length === 0, "$reset limpia el array");
}

// ── Test 9: template usa store directamente ───────────────────────────────────
groupF5("Store — 9. Template reacciona al store");
{
  const s9 = createStore({ msg: "inicio" });
  const el9 = document.createElement("div");
  mount(html`<p id="p9">${() => s9.msg.value}</p>`, el9);
  assertF5(el9.querySelector("#p9")!.textContent === "inicio", "inicial: 'inicio'");
  s9.msg.value = "cambiado";
  assertF5(el9.querySelector("#p9")!.textContent === "cambiado", "reactivo: 'cambiado'");
}

// ── Test 10: múltiples stores independientes ──────────────────────────────────
groupF5("Store — 10. Múltiples stores son independientes");
{
  const sa = createStore({ n: 1 });
  const sb = createStore({ n: 1 });
  sa.n.value = 100;
  assertF5(sa.n.value === 100, "store A: 100");
  assertF5(sb.n.value === 1, "store B: sigue en 1 (independiente)");
}

// ── Resumen F5 ────────────────────────────────────────────────────────────────
const summaryF5 = document.getElementById("summary5")!;
const allPassedF5 = failedF5 === 0;
summaryF5.innerHTML = `
  <div class="summary ${allPassedF5 ? "all-pass" : "has-fail"}">
    ${allPassedF5 ? "🎉" : "⚠️"} ${passedF5} pasaron, ${failedF5} fallaron
    ${allPassedF5 ? " — ¡Stores funcionando!" : ""}
  </div>
`;

// ── Demo Interactivo F5 ───────────────────────────────────────────────────────
const demoF5 = document.getElementById("demo5")!;

// Store global de carrito de compras
const cartStore = createStore(
  { items: [] as { id: number; name: string; qty: number; price: number }[], nextId: 1 },
  (s) => ({
    addItem(name: string, price: number) {
      s.items.update((arr) => [
        ...arr,
        { id: s.nextId.peek(), name, qty: 1, price },
      ]);
      s.nextId.update((n) => n + 1);
    },
    removeItem(id: number) {
      s.items.update((arr) => arr.filter((i) => i.id !== id));
    },
    changeQty(id: number, delta: number) {
      s.items.update((arr) =>
        arr.flatMap((i) => {
          if (i.id !== id) return [i];
          const newQty = i.qty + delta;
          return newQty <= 0 ? [] : [{ ...i, qty: newQty }];
        })
      );
    },
  })
);

// Store de cupón de descuento
const discountStore = createStore(
  { code: "", pct: 0 },
  (s) => ({
    apply(code: string) {
      const codes: Record<string, number> = { NIX10: 10, NIX25: 25, NIX50: 50 };
      const pct = codes[code.toUpperCase()] ?? 0;
      s.code.value = pct > 0 ? code.toUpperCase() : "";
      s.pct.value = pct;
    },
    clear() { discountStore.$reset(); },
  })
);

// ─── Componente: fila de item ───
class CartItem extends NixComponent {
  private item: { id: number; name: string; qty: number; price: number };
  constructor(item: { id: number; name: string; qty: number; price: number }) {
    super();
    this.item = item;
  }

  render() {
    const { id, name, qty, price } = this.item;
    const lineTotal = (price * qty).toFixed(2);
    return html`
      <div class="todo-item" style="display:flex;align-items:center;gap:8px">
        <span style="flex:1">${name}</span>
        <span style="opacity:.6;font-size:.85rem">$${price.toFixed(2)}</span>
        <button @click=${() => cartStore.changeQty(id, -1)} style="width:28px">−</button>
        <span style="min-width:20px;text-align:center">${qty}</span>
        <button @click=${() => cartStore.changeQty(id, +1)} style="width:28px">+</button>
        <span style="min-width:55px;text-align:right;font-weight:600">$${lineTotal}</span>
        <button class="btn-remove" @click=${() => cartStore.removeItem(id)}>✕</button>
      </div>
    `;
  }
}

// ─── Componente: resumen de totales ───
class CartSummary extends NixComponent {
  render() {
    const subtotal = computed(() =>
      cartStore.items.value.reduce((s, i) => s + i.price * i.qty, 0)
    );
    const discount = computed(() => subtotal.value * discountStore.pct.value / 100);
    const total = computed(() => subtotal.value - discount.value);

    return html`
      <div class="widget" style="min-width:220px">
        <div class="widget-label">🧾 Resumen</div>
        <div style="margin:8px 0;line-height:2">
          <div style="display:flex;justify-content:space-between">
            <span>Subtotal</span><span>$${() => subtotal.value.toFixed(2)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;color:#f87171">
            <span>Descuento ${() => discountStore.pct.value > 0 ? `(${discountStore.pct.value}%)` : ""}</span>
            <span>−$${() => discount.value.toFixed(2)}</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-weight:700;font-size:1.1rem;border-top:1px solid #334;padding-top:6px">
            <span>Total</span><span>$${() => total.value.toFixed(2)}</span>
          </div>
        </div>
        <div style="display:flex;gap:6px;margin-top:8px">
          <input id="coupon-input" placeholder="Cupón (NIX10,25,50)"
            style="flex:1;padding:4px 8px;background:#1e293b;color:#e2e8f0;border:1px solid #334;border-radius:4px"
            @input=${(e: Event) => discountStore.apply((e.target as HTMLInputElement).value)}
          />
          <button @click=${() => {
        discountStore.clear();
        (document.getElementById("coupon-input") as HTMLInputElement).value = "";
      }}>✕</button>
        </div>
        ${() => discountStore.code.value
        ? html`<div style="color:#4ade80;font-size:.85rem;margin-top:4px">✓ Cupón ${discountStore.code.value} aplicado</div>`
        : null
      }
      </div>
    `;
  }
}

// ─── Componente raíz: carrito ───
const PRODUCTS = [
  { name: "Signal Kit", price: 19.99 },
  { name: "Template Pro", price: 29.99 },
  { name: "Router Bundle", price: 49.99 },
  { name: "Lifecycle Pack", price: 14.99 },
];

mount(
  html`
    <div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
        ${PRODUCTS.map((p) =>
    html`<button @click=${() => cartStore.addItem(p.name, p.price)}>
            + ${p.name} ($${p.price.toFixed(2)})
          </button>`
  )}
        <button @click=${() => cartStore.$reset()} style="opacity:.6">🗑 Vaciar</button>
      </div>
      <div class="demo-grid" style="align-items:start">
        <div>
          <div class="widget-label" style="margin-bottom:8px">🛒 Carrito</div>
          <div class="todo-list">
            ${() =>
      cartStore.items.value.length === 0
        ? [html`<div style="opacity:.4;padding:8px">Carrito vacío — agrega productos arriba</div>`]
        : cartStore.items.value.map((item) => new CartItem(item))
    }
          </div>
        </div>
        ${new CartSummary()}
      </div>
    </div>
  `,
  demoF5
);

// ══════════════════════════════════════════════════════════════
//  FASE 6: Router
//  Tests → #tests6 | Summary → #summary6 | Demo → #demo6
// ══════════════════════════════════════════════════════════════
import { createRouter, RouterView, Link, useRouter } from "./nix";
import type { NixTemplate } from "./nix";

// ── helpers Fase 6 ────────────────────────────────────────────────────────────
const testsF6 = document.getElementById("tests6")!;
const summaryF6 = document.getElementById("summary6")!;
let passF6 = 0, failF6 = 0;

function assertF6(cond: boolean, msg: string) {
  const el = document.createElement("div");
  el.className = "test-line " + (cond ? "pass" : "fail");
  el.textContent = (cond ? "✓ " : "✗ ") + msg;
  testsF6.appendChild(el);
  cond ? passF6++ : failF6++;
}

function groupF6(name: string) {
  const el = document.createElement("div");
  el.className = "test-group";
  el.textContent = "▸ " + name;
  testsF6.appendChild(el);
}

function summaryDoneF6() {
  summaryF6.innerHTML = `<div class="summary ${failF6 === 0 ? "all-pass" : "has-fail"}">
    Fase 6 — ${passF6 + failF6} tests: ${passF6} ✓  ${failF6} ✗
  </div>`;
}

// ── Test 1: createRouter devuelve la API correcta ─────────────────────────────
groupF6("Router — 1. createRouter devuelve current, navigate, routes");
{
  const r = createRouter([
    { path: "/", component: () => html`<span>home</span>` },
  ]);
  assertF6(typeof r.current === "object" && "value" in r.current, "current es Signal");
  assertF6(typeof r.params === "object" && "value" in r.params, "params es Signal");
  assertF6(typeof r.navigate === "function", "navigate es función");
  assertF6(Array.isArray(r.routes) && r.routes.length === 1, "routes es array con 1 entrada");
}

// ── Test 2: navigate actualiza current síncronamente ─────────────────────────
groupF6("Router — 2. navigate actualiza current de forma síncrona");
{
  const r = createRouter([{ path: "/x", component: () => html`<span>x</span>` }]);
  r.navigate("/x");
  assertF6(r.current.value === "/x", "current.value === '/x' tras navigate");
  r.navigate("/y");
  assertF6(r.current.value === "/y", "current.value === '/y' tras segundo navigate");
}

// ── Test 3: navigate actualiza window.location.hash ──────────────────────────
groupF6("Router — 3. navigate actualiza window.location.pathname");
{
  const r = createRouter([]);
  r.navigate("/pathname-test");
  assertF6(window.location.pathname === "/pathname-test", "pathname === '/pathname-test'");
}

// ── Test 4: computed sobre current ───────────────────────────────────────────
groupF6("Router — 4. computed reactivo sobre router.current");
{
  const r = createRouter([]);
  const label = computed(() => r.current.value === "/home" ? "estás en home" : "otra ruta");
  r.navigate("/other");
  assertF6(label.value === "otra ruta", "computed: 'otra ruta'");
  r.navigate("/home");
  assertF6(label.value === "estás en home", "computed: 'estás en home'");
}

// ── Test 5: effect se dispara al cambiar ruta ─────────────────────────────────
groupF6("Router — 5. effect se ejecuta al navegar");
{
  const r = createRouter([]);
  const log: string[] = [];
  const stop = effect(() => { log.push(r.current.value); });
  r.navigate("/a");
  r.navigate("/b");
  stop();
  assertF6(log.length >= 3, "effect corrió al menos 3 veces (init + 2 navigates)");
  assertF6(log.includes("/a") && log.includes("/b"), "log contiene /a y /b");
}

// ── Test 6: RouterView monta el componente correcto ───────────────────────────
groupF6("Router — 6. RouterView renderiza la ruta correcta");
{
  const r = createRouter([
    { path: "/", component: () => html`<span id="rv6-home">home-view</span>` },
    { path: "/info", component: () => html`<span id="rv6-info">info-view</span>` },
  ]);
  r.navigate("/");
  const host6 = document.createElement("div");
  document.body.appendChild(host6);
  mount(new RouterView(), host6);
  assertF6(host6.querySelector("#rv6-home") !== null, "renderiza home en ruta '/'");
  assertF6(host6.querySelector("#rv6-info") === null, "no renderiza info en ruta '/'");
  host6.remove();
}

// ── Test 7: RouterView cambia vista al navegar ────────────────────────────────
groupF6("Router — 7. RouterView actualiza vista al cambiar ruta");
{
  const r = createRouter([
    { path: "/p", component: () => html`<span id="rv7-p">page-p</span>` },
    { path: "/q", component: () => html`<span id="rv7-q">page-q</span>` },
  ]);
  r.navigate("/p");
  const host7 = document.createElement("div");
  document.body.appendChild(host7);
  mount(new RouterView(), host7);
  assertF6(host7.querySelector("#rv7-p") !== null, "vista /p antes de navegar");
  r.navigate("/q");
  assertF6(host7.querySelector("#rv7-q") !== null, "vista /q tras navegar");
  assertF6(host7.querySelector("#rv7-p") === null, "/p ya no está en DOM");
  host7.remove();
}

// ── Test 8: RouterView muestra 404 sin wildcard ───────────────────────────────
groupF6("Router — 8. RouterView muestra 404 cuando no hay ruta ni wildcard");
{
  const r = createRouter([{ path: "/known", component: () => html`<span>known</span>` }]);
  r.navigate("/nope");
  const host8 = document.createElement("div");
  document.body.appendChild(host8);
  mount(new RouterView(), host8);
  assertF6(host8.textContent?.includes("404"), "texto contiene '404'");
  host8.remove();
}

// ── Test 9: RouterView usa fallback wildcard * ────────────────────────────────
groupF6("Router — 9. RouterView usa ruta wildcard '*' como fallback");
{
  const r = createRouter([
    { path: "/", component: () => html`<span>home</span>` },
    { path: "*", component: () => html`<span id="rv9-wild">not-found</span>` },
  ]);
  r.navigate("/nonexistent");
  const host9 = document.createElement("div");
  document.body.appendChild(host9);
  mount(new RouterView(), host9);
  assertF6(host9.querySelector("#rv9-wild") !== null, "renderiza componente wildcard");
  host9.remove();
}

// ── Test 10: Link renders con href correcto ───────────────────────────────────
groupF6("Router — 10. Link renderiza href con el prefijo '#'");
{
  const r = createRouter([]);
  r.navigate("/");
  const host10 = document.createElement("div");
  document.body.appendChild(host10);
  mount(new Link("/docs", "Docs"), host10);
  const a = host10.querySelector("a");
  assertF6(a !== null, "existe <a>");
  assertF6(a?.getAttribute("href") === "/docs", "href === '/docs'");
  host10.remove();
}

// ── Test 11: Link aplica estilos activo/inactivo ──────────────────────────────
groupF6("Router — 11. Link aplica estilo activo/inactivo según ruta actual");
{
  const r = createRouter([]);
  r.navigate("/active");
  const hostActive = document.createElement("div");
  const hostOther = document.createElement("div");
  document.body.appendChild(hostActive);
  document.body.appendChild(hostOther);
  mount(new Link("/active", "Active"), hostActive);
  mount(new Link("/other", "Other"), hostOther);
  const aActive = hostActive.querySelector("a");
  const aOther = hostOther.querySelector("a");
  assertF6(aActive?.getAttribute("style")?.includes("font-weight:700") ?? false, "link activo tiene font-weight:700");
  assertF6(!(aOther?.getAttribute("style")?.includes("font-weight:700") ?? false), "link inactivo NO tiene font-weight:700");
  hostActive.remove();
  hostOther.remove();
}

// ── Test 12: Rutas anidadas (children) ─────────────────────────────────────
groupF6("Router — 12. Rutas anidadas con children");
{
  const r = createRouter([
    {
      path: "/dash",
      component: () => html`<div id="dash-layout">${new RouterView(1)}</div>`,
      children: [
        { path: "/users", component: () => html`<span id="dash-users">users</span>` },
        { path: "/config", component: () => html`<span id="dash-config">config</span>` },
      ],
    },
  ]);
  r.navigate("/dash/users");
  const host12 = document.createElement("div");
  document.body.appendChild(host12);
  mount(new RouterView(), host12);
  assertF6(host12.querySelector("#dash-layout") !== null, "layout padre renderizado");
  assertF6(host12.querySelector("#dash-users") !== null, "hijo 'users' renderizado en depth 1");
  assertF6(host12.querySelector("#dash-config") === null, "hijo 'config' no renderizado");
  r.navigate("/dash/config");
  assertF6(host12.querySelector("#dash-config") !== null, "hijo 'config' tras navegar");
  assertF6(host12.querySelector("#dash-users") === null, "'users' ya no presente");
  host12.remove();
}

// ── Test 13: Parámetro dinámico simple (:id) ──────────────────────────────────
groupF6("Router — 13. Parámetro dinámico :id");
{
  const r = createRouter([
    { path: "/users/:id", component: () => html`<span>user</span>` },
    { path: "/users", component: () => html`<span>list</span>` },
  ]);
  r.navigate("/users");
  assertF6(r.current.value === "/users", "current === '/users'");
  assertF6(Object.keys(r.params.value).length === 0, "params vacío en ruta literal");
  r.navigate("/users/42");
  assertF6(r.current.value === "/users/42", "current === '/users/42'");
  assertF6(r.params.value.id === "42", "params.id === '42'");
  r.navigate("/users/alice");
  assertF6(r.params.value.id === "alice", "params.id === 'alice'");
}

// ── Test 14: Múltiples parámetros en la misma ruta ────────────────────────────
groupF6("Router — 14. Múltiples params (:slug y :cid)");
{
  const r = createRouter([
    { path: "/posts/:slug/comments/:cid", component: () => html`<span>comment</span>` },
  ]);
  r.navigate("/posts/nix-js/comments/7");
  assertF6(r.params.value.slug === "nix-js", "params.slug === 'nix-js'");
  assertF6(r.params.value.cid === "7", "params.cid  === '7'");
  // Literal tiene mayor prioridad que param
  const r2 = createRouter([
    { path: "/items/:id", component: () => html`<span>param</span>` },
    { path: "/items/new", component: () => html`<span>literal</span>` },
  ]);
  r2.navigate("/items/new");
  assertF6(Object.keys(r2.params.value).length === 0, "literal gana sobre :id — params vacío");
  r2.navigate("/items/99");
  assertF6(r2.params.value.id === "99", "no-literal cae en :id");
}

summaryDoneF6();

// ── Tests 15-19: Query params ───────────────────────────────────────────────
groupF6("Router — 15. query inicial vacío");
{
  const r = createRouter([]);
  r.navigate("/");
  assertF6(typeof r.query.value === "object", "query.value es objeto");
  assertF6(Object.keys(r.query.value).length === 0, "query vacío al navegar a '/'");
}

groupF6("Router — 16. navigate con query string en el path");
{
  const r = createRouter([]);
  r.navigate("/items?page=2&sort=name");
  assertF6(r.current.value === "/items", "current es '/items' (sin el ?)");
  assertF6(r.query.value.page === "2", "query.page === '2'");
  assertF6(r.query.value.sort === "name", "query.sort === 'name'");
  assertF6(window.location.search === "?page=2&sort=name", "URL contiene ?page=2&sort=name");
}

groupF6("Router — 17. navigate con objeto query (segundo argumento)");
{
  const r = createRouter([]);
  r.navigate("/search", { q: "nix", limit: 20 });
  assertF6(r.current.value === "/search", "current === '/search'");
  assertF6(r.query.value.q === "nix", "query.q === 'nix'");
  assertF6(r.query.value.limit === "20", "query.limit === '20' (number convertido)");
}

groupF6("Router — 18. objeto query tiene precedencia sobre inline");
{
  const r = createRouter([]);
  r.navigate("/list?page=1&sort=id", { page: 3 }); // page del objeto sobreescribe
  assertF6(r.query.value.page === "3", "page del objeto (3) sobreescribe inline (1)");
  assertF6(r.query.value.sort === "id", "sort del inline se conserva");
}

groupF6("Router — 19. query es reactivo (effect + computed)");
{
  const r = createRouter([]);
  r.navigate("/");
  const label = computed(() =>
    r.query.value.view === "grid" ? "vista grid" : "vista lista"
  );
  assertF6(label.value === "vista lista", "computed: vista lista sin query");
  r.navigate("/", { view: "grid" });
  assertF6(label.value === "vista grid", "computed: vista grid tras navigate");
  r.navigate("/");
  assertF6(label.value === "vista lista", "computed: vuelve a lista sin query");
}

// ── Demo Fase 6: Mini-SPA ─────────────────────────────────────────────────────
const demoF6 = document.getElementById("demo6")!;

const appRouter = createRouter([
  { path: "/", component: () => new HomePage() },
  { path: "/counter", component: () => new CounterPage() },
  { path: "/users", component: () => new UsersPage() },
  { path: "/users/:id", component: () => new UserDetailPage() },
  { path: "/about", component: () => new AboutPage() },
  { path: "*", component: () => new NotFoundPage() },
]);

// Iniciar en /
appRouter.navigate("/");

class HomePage extends NixComponent {
  render(): NixTemplate {
    return html`
      <div style="padding:8px 0">
        <h3 style="color:#38bdf8;margin:0 0 8px">🏠 Home</h3>
        <p style="color:#a3a3a3;margin:0">Bienvenido a la demo del router de Nix.js.</p>
        <p style="color:#a3a3a3;margin:8px 0 0">Navega usando los links de arriba ↑</p>
      </div>
    `;
  }
}

class CounterPage extends NixComponent {
  private count = signal(0);

  render(): NixTemplate {
    return html`
      <div style="padding:8px 0">
        <h3 style="color:#38bdf8;margin:0 0 8px">🔢 Counter</h3>
        <div class="demo-value">${() => this.count.value}</div>
        <div class="demo-row">
          <button @click=${() => this.count.update((n) => n - 1)}>− 1</button>
          <button @click=${() => this.count.update((n) => n + 1)}>+ 1</button>
          <button @click=${() => (this.count.value = 0)} style="opacity:.6">Reset</button>
        </div>
      </div>
    `;
  }
}

class AboutPage extends NixComponent {
  render(): NixTemplate {
    return html`
      <div style="padding:8px 0">
        <h3 style="color:#38bdf8;margin:0 0 8px">ℹ️ About</h3>
        <p style="color:#a3a3a3;margin:0 0 6px">
          <strong style="color:#e5e5e5">Nix.js</strong> — micro-framework reactivo.
        </p>
        <ul style="color:#a3a3a3;margin:0;padding-left:18px;line-height:1.8">
          <li>⚛️  Reactivity: <code>signal · computed · effect · batch</code></li>
          <li>🧩  Templates: <code>html\`\`</code> tagged templates</li>
          <li>🏗️  Components: <code>NixComponent</code> con lifecycle</li>
          <li>🗄️  Stores: <code>createStore</code> compartido</li>
          <li>🔀  Router: <code>createRouter · RouterView · Link</code></li>
        </ul>
      </div>
    `;
  }
}

class NotFoundPage extends NixComponent {
  render(): NixTemplate {
    return html`
      <div style="padding:8px 0">
        <h3 style="color:#f87171;margin:0 0 8px">🚫 404</h3>
        <p style="color:#a3a3a3;margin:0">Ruta no encontrada.</p>
      </div>
    `;
  }
}

const DEMO_USERS = [
  { id: "1", name: "Alice", role: "Admin" },
  { id: "2", name: "Bob", role: "Editor" },
  { id: "3", name: "Charlie", role: "Viewer" },
];

class UsersPage extends NixComponent {
  render(): NixTemplate {
    return html`
      <div style="padding:8px 0">
        <h3 style="color:#38bdf8;margin:0 0 8px">👥 Users</h3>
        <ul style="margin:0;padding-left:18px;line-height:2">
          ${DEMO_USERS.map((u) =>
      html`<li><a
              href="/users/${u.id}"
              style="color:#a78bfa;cursor:pointer"
              @click=${(e: Event) => { e.preventDefault(); appRouter.navigate("/users/" + u.id); }}
            >${u.name}</a> — <span style="color:#71717a">${u.role}</span></li>`
    )}
        </ul>
      </div>
    `;
  }
}

class UserDetailPage extends NixComponent {
  render(): NixTemplate {
    return html`
      <div style="padding:8px 0">
        <h3 style="color:#38bdf8;margin:0 0 8px">👤 User detail</h3>
        ${() => {
        const id = useRouter().params.value.id;
        const user = DEMO_USERS.find((u) => u.id === id);
        if (!user) return html`<p style="color:#f87171">Usuario #${id} no encontrado.</p>`;
        return html`
            <p style="color:#e5e5e5;margin:0 0 4px">
              <strong>ID:</strong> <code style="color:#38bdf8">${user.id}</code>
            </p>
            <p style="color:#e5e5e5;margin:0 0 4px">
              <strong>Nombre:</strong> ${user.name}
            </p>
            <p style="color:#e5e5e5;margin:0">
              <strong>Rol:</strong>
              <span style="color:#a78bfa">${user.role}</span>
            </p>
          `;
      }}
        <button
          style="margin-top:12px;font-size:12px;padding:4px 10px;opacity:.6"
          @click=${() => appRouter.navigate("/users")}
        >← Volver</button>
      </div>
    `;
  }
}

// ── Nav + RouterView ──────────────────────────────────────────────────────────
mount(
  html`
    <div>
      <nav style="display:flex;gap:4px;align-items:center;margin-bottom:12px;padding:10px 12px;background:#1a1a1a;border-radius:8px;border:1px solid #2a2a2a">
        <span style="color:#52525b;font-size:13px;margin-right:8px">Nix Router</span>
        ${new Link("/", "🏠 Home")}
        ${new Link("/counter", "🔢 Counter")}
        ${new Link("/users", "👥 Users")}
        ${new Link("/about", "ℹ️ About")}
        <button
          style="margin-left:auto;font-size:12px;padding:4px 10px;opacity:.6"
          @click=${() => appRouter.navigate("/unknown-page")}
        >→ 404</button>
      </nav>
      <div class="section" style="margin:0">
        ${new RouterView()}
      </div>
    </div>
  `,
  demoF6
);

// ╔══════════════════════════════════════════════════════════════
//  FASE 7: repeat() — Keyed Diffing
//  Tests → #tests7 | Summary → #summary7 | Demo → #demo7
// ══════════════════════════════════════════════════════════════
import { repeat } from "./nix";

const testsF7 = document.getElementById("tests7")!;
const summaryF7 = document.getElementById("summary7")!;
let passF7 = 0, failF7 = 0;

function assertF7(cond: boolean, msg: string) {
  const el = document.createElement("div");
  el.className = "test-line " + (cond ? "pass" : "fail");
  el.textContent = (cond ? "✓ " : "✗ ") + msg;
  testsF7.appendChild(el);
  cond ? passF7++ : failF7++;
}
function groupF7(name: string) {
  const el = document.createElement("div");
  el.className = "test-group";
  el.textContent = "▸ " + name;
  testsF7.appendChild(el);
}
function summaryDoneF7() {
  summaryF7.innerHTML = `<div class="summary ${failF7 === 0 ? "all-pass" : "has-fail"}">
    Fase 7 — ${passF7 + failF7} tests: ${passF7} ✓  ${failF7} ✗
  </div>`;
}

// ── Test 1: repeat renderiza la lista inicial ────────────────────────────────
groupF7("repeat — 1. Renderiza lista inicial");
{
  const items = signal([{ id: 1, name: "Alice" }, { id: 2, name: "Bob" }]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  mount(html`<ul>${() => repeat(items.value, i => i.id, i => html`<li id=${"u" + i.id}>${i.name}</li>`)}</ul>`, host);
  assertF7(host.querySelector("#u1") !== null, "item 1 renderizado");
  assertF7(host.querySelector("#u2") !== null, "item 2 renderizado");
  assertF7(host.querySelectorAll("li").length === 2, "exactamente 2 <li>");
  host.remove();
}

// ── Test 2: agregar item al final ─────────────────────────────────────────
groupF7("repeat — 2. Añade item al final");
{
  const items = signal([{ id: 1 }, { id: 2 }]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  mount(html`<ul>${() => repeat(items.value, i => i.id, i => html`<li id=${"a" + i.id}>${i.id}</li>`)}</ul>`, host);
  items.value = [...items.value, { id: 3 }];
  assertF7(host.querySelector("#a3") !== null, "item 3 añadido");
  assertF7(host.querySelectorAll("li").length === 3, "3 items en DOM");
  host.remove();
}

// ── Test 3: eliminar item ──────────────────────────────────────────────────ngroupF7("repeat — 3. Elimina item");
{
  const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  mount(html`<ul>${() => repeat(items.value, i => i.id, i => html`<li id=${"d" + i.id}>${i.id}</li>`)}</ul>`, host);
  items.value = items.value.filter(i => i.id !== 2);
  assertF7(host.querySelector("#d2") === null, "item 2 eliminado del DOM");
  assertF7(host.querySelectorAll("li").length === 2, "quedan 2 items");
  host.remove();
}

// ── Test 4: los nodos DOM existentes se PRESERVAN (no se recrean) ────────
groupF7("repeat — 4. Preserva nodos DOM existentes al actualizar");
{
  const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  mount(html`<ul>${() => repeat(items.value, i => i.id, i => html`<li id=${"p" + i.id}>${i.id}</li>`)}</ul>`, host);

  // Guardamos referencia al nodo del item 1 antes de actualizar
  const li1Before = host.querySelector("#p1");

  // Añadimos un item al inicio
  items.value = [{ id: 0 }, ...items.value];

  const li1After = host.querySelector("#p1");
  assertF7(li1Before === li1After, "nodo #p1 es el MISMO objeto (no recreado)");
  assertF7(host.querySelectorAll("li").length === 4, "4 items en DOM");
  host.remove();
}

// ── Test 5: reordenar la lista ────────────────────────────────────────────────ngroupF7("repeat — 5. Reordena sin recrear nodos");
{
  const items = signal([{ id: 1 }, { id: 2 }, { id: 3 }]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  mount(html`<ul>${() => repeat(items.value, i => i.id, i => html`<li id=${"r" + i.id}>${i.id}</li>`)}</ul>`, host);

  const li2Before = host.querySelector("#r2");
  items.value = [{ id: 3 }, { id: 1 }, { id: 2 }]; // reordenar
  const li2After = host.querySelector("#r2");

  assertF7(li2Before === li2After, "nodo #r2 preservado tras reordenar");
  const lis = host.querySelectorAll("li");
  assertF7(lis[0].id === "r3" && lis[1].id === "r1" && lis[2].id === "r2", "orden corregido: 3,1,2");
  host.remove();
}

// ── Test 6: lista vacía ───────────────────────────────────────────────────────────ngroupF7("repeat — 6. Lista vacía inicial y rellenado posterior");
{
  const items = signal<{ id: number }[]>([]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  mount(html`<ul>${() => repeat(items.value, i => i.id, i => html`<li id=${"e" + i.id}>${i.id}</li>`)}</ul>`, host);
  assertF7(host.querySelectorAll("li").length === 0, "lista vacía inicial");
  items.value = [{ id: 1 }, { id: 2 }];
  assertF7(host.querySelectorAll("li").length === 2, "2 items tras rellenar");
  items.value = [];
  assertF7(host.querySelectorAll("li").length === 0, "vacía tras limpiar");
  host.remove();
}

// ── Test 7: repeat con NixComponent ──────────────────────────────────────────
groupF7("repeat — 7. Funciona con NixComponent");
{
  class TagComp extends NixComponent {
    private _id: number;
    constructor(id: number) { super(); this._id = id; }
    render() { return html`<span id=${"tc" + this._id}>${this._id}</span>`; }
  }
  const items = signal([1, 2, 3]);
  const host = document.createElement("div");
  document.body.appendChild(host);
  mount(html`<div>${() => repeat(items.value, id => id, id => new TagComp(id))}</div>`, host);
  assertF7(host.querySelector("#tc1") !== null, "componente tc1 renderizado");
  items.value = [1, 3];  // elimina 2
  assertF7(host.querySelector("#tc2") === null, "componente tc2 eliminado");
  assertF7(host.querySelector("#tc1") !== null, "componente tc1 preservado");
  host.remove();
}

summaryDoneF7();

// ── Demo Fase 7: Todo list con keyed diffing ────────────────────────────
const demoF7 = document.getElementById("demo7")!;

interface TodoItem { id: number; text: string; done: boolean; }
let nextId = 1;

const todos = signal<TodoItem[]>([
  { id: nextId++, text: "Probar repeat()", done: false },
  { id: nextId++, text: "Implementar diffing", done: true },
  { id: nextId++, text: "Escribir tests", done: false },
]);
const inputVal = signal("");

function addTodo() {
  const text = inputVal.value.trim();
  if (!text) return;
  todos.value = [...todos.value, { id: nextId++, text, done: false }];
  inputVal.value = "";
}
function toggleTodo(id: number) {
  todos.value = todos.value.map(t => t.id === id ? { ...t, done: !t.done } : t);
}
function removeTodo(id: number) {
  todos.value = todos.value.filter(t => t.id !== id);
}
function shuffleTodos() {
  todos.value = [...todos.value].sort(() => Math.random() - 0.5);
}

mount(
  html`
    <div>
      <div class="demo-row" style="margin-bottom:12px">
        <input
          style="flex:1;background:#1a1a1a;border:1px solid #2a2a2a;color:#e5e5e5;padding:6px 10px;border-radius:6px;font-size:14px"
          placeholder="Nueva tarea…"
          value=${() => inputVal.value}
          @input=${(e: Event) => inputVal.value = (e.target as HTMLInputElement).value}
          @keydown=${(e: KeyboardEvent) => e.key === "Enter" && addTodo()}
        />
        <button @click=${addTodo}>Añadir</button>
        <button @click=${shuffleTodos} style="opacity:.6">Mezclar</button>
      </div>
      <ul style="list-style:none;margin:0;padding:0">
        ${() => repeat(
    todos.value,
    t => t.id,
    t => html`
            <li style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid #1a1a1a">
              <input
                type="checkbox"
                style="accent-color:#38bdf8"
                ${() => t.done ? "checked" : ""}
                @change=${() => toggleTodo(t.id)}
              />
              <span style=${() => t.done ? "color:#52525b;text-decoration:line-through;flex:1" : "color:#e5e5e5;flex:1"}>
                ${t.text}
              </span>
              <button
                style="font-size:11px;padding:2px 8px;opacity:.5"
                @click=${() => removeTodo(t.id)}
              >×</button>
            </li>
          `
  )}
      </ul>
      <div style="margin-top:12px;color:#52525b;font-size:13px">
        ${() => todos.value.filter(t => !t.done).length} pendiente(s) ·
        ${() => todos.value.filter(t => t.done).length} hecha(s)
      </div>
    </div>
  `,
  demoF7
);

// ╔══════════════════════════════════════════════════════════════
//  FASE 8: lazy() + suspend() — Lazy loading & Suspense
//  Tests → #tests8 | Summary → #summary8 | Demo → #demo8
// ══════════════════════════════════════════════════════════════
import { suspend, lazy } from "./nix";

const testsF8 = document.getElementById("tests8")!;
const summaryF8 = document.getElementById("summary8")!;
let passF8 = 0, failF8 = 0;

function assertF8(cond: boolean, msg: string) {
  const el = document.createElement("div");
  el.className = "test-line " + (cond ? "pass" : "fail");
  el.textContent = (cond ? "✓ " : "✗ ") + msg;
  testsF8.appendChild(el);
  cond ? passF8++ : failF8++;
}
function groupF8(name: string) {
  const el = document.createElement("div");
  el.className = "test-group";
  el.textContent = "▸ " + name;
  testsF8.appendChild(el);
}
function summaryDoneF8() {
  summaryF8.innerHTML = `<div class="summary ${failF8 === 0 ? "all-pass" : "has-fail"}">
    Fase 8 — ${passF8 + failF8} tests: ${passF8} ✓  ${failF8} ✗
  </div>`;
}

// ── Test 1: suspend muestra fallback inmediatamente ──────────────────────────
groupF8("suspend — 1. Muestra fallback mientras la promesa está pendiente");
{
  const host = document.createElement("div");
  document.body.appendChild(host);

  // Promesa que nunca resuelve (simula carga infinita)
  const neverResolves = () => new Promise<string>(() => {/* never */ });
  const comp = suspend(neverResolves, data => html`<span>${data}</span>`, {
    fallback: html`<span id="fb1">Cargando…</span>`,
  });
  mount(html`<div>${comp}</div>`, host);

  assertF8(host.querySelector("#fb1") !== null, "el fallback aparece en el DOM inmediatamente");
  host.remove();
}

// ── Test 2: suspend renderiza el contenido tras resolver ─────────────────────
groupF8("suspend — 2. Renderiza contenido después de que la promesa resuelve");
{
  const host = document.createElement("div");
  document.body.appendChild(host);

  let resolveIt!: (v: string) => void;
  const p = new Promise<string>(res => { resolveIt = res; });
  const comp = suspend(() => p, data => html`<span id="res2">${data}</span>`, {
    fallback: html`<span id="fb2">…</span>`,
  });
  mount(html`<div>${comp}</div>`, host);

  assertF8(host.querySelector("#res2") === null, "contenido NO aparece antes de resolver");

  resolveIt("hola");
  // Esperamos un tick para que la promesa propague
  p.then(() => {
    assertF8(host.querySelector("#res2") !== null, "contenido aparece después de resolver");
    assertF8(host.querySelector("#fb2") === null, "fallback desaparece al resolver");
    host.remove();
  });
}

// ── Test 3: suspend muestra errorFallback en caso de rechazo ─────────────────
groupF8("suspend — 3. Muestra errorFallback cuando la promesa falla");
{
  const host = document.createElement("div");
  document.body.appendChild(host);

  let rejectIt!: (reason: unknown) => void;
  const p = new Promise<string>((_res, rej) => { rejectIt = rej; });
  const comp = suspend(() => p, data => html`<span>${data}</span>`, {
    fallback: html`<span id="fb3">cargando</span>`,
    errorFallback: (err) => html`<span id="err3">${String(err)}</span>`,
  });
  mount(html`<div>${comp}</div>`, host);

  rejectIt("Error de red");
  p.catch(() => {
    assertF8(host.querySelector("#err3") !== null, "errorFallback aparece en DOM");
    assertF8(host.querySelector("#fb3") === null, "fallback desaparece al rechazar");
    host.remove();
  });
}

// ── Test 4: suspend sin opciones usa fallback por defecto ────────────────────
groupF8("suspend — 4. Fallback por defecto (spinner) sin opciones");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const comp = suspend(() => new Promise<string>(() => { }), d => html`<span>${d}</span>`);
  mount(html`<div>${comp}</div>`, host);
  // Debe haber algún contenido en el DOM (el spinner por defecto)
  assertF8(host.querySelector(".nix-suspense") !== null, "wrapper .nix-suspense presente");
  assertF8(host.querySelector(".nix-spinner") !== null, "spinner por defecto presente");
  host.remove();
}

// ── Test 5: lazy retorna NixComponent la primera vez (pending) ───────────────
groupF8("lazy — 5. Primera llamada carga el chunk (muestra fallback)");
{
  const host = document.createElement("div");
  document.body.appendChild(host);

  class FakePageComp extends NixComponent {
    render() { return html`<span id="lazy5page">LazyPage</span>`; }
  }

  let resolveImport!: (mod: { default: new () => NixComponent }) => void;
  const importFn = () => new Promise<{ default: new () => NixComponent }>(res => {
    resolveImport = res;
  });

  const lazyComp = lazy(importFn, html`<span id="lazy5fb">importando…</span>`);

  mount(html`<div>${lazyComp()}</div>`, host);

  assertF8(host.querySelector("#lazy5fb") !== null, "fallback visible mientras importa");

  resolveImport({ default: FakePageComp });
  // Esperar resolución
  importFn().catch(() => { }).finally?.(() => { });
  setTimeout(() => {
    assertF8(host.querySelector("#lazy5page") !== null, "componente lazy renderizado tras import");
    host.remove();
  }, 50);
}

// ── Test 6: lazy cachea — segunda invocación no reimporta ────────────────────
groupF8("lazy — 6. Resultado cacheado: segunda llamada instancia directamente");
{
  let importCount = 0;
  class CachedComp extends NixComponent {
    render() { return html`<span id="lazy6">cached</span>`; }
  }

  // importFn que resuelve inmediatamente
  const importFn = () => {
    importCount++;
    return Promise.resolve({ default: CachedComp });
  };

  const lazyComp = lazy(importFn);

  // Primera llamada — dispara import (importCount → 1 al resolver)
  const first = lazyComp();
  const host1 = document.createElement("div");
  document.body.appendChild(host1);
  mount(html`<div>${first}</div>`, host1);

  // Esperamos un tick para que el import se cachee
  Promise.resolve().then(() => {
    assertF8(importCount === 1, `import invocado ${importCount} vez (primera carga)`);

    // Segunda llamada — debe instanciar directamente
    const second = lazyComp();
    assertF8(second instanceof NixComponent, "segunda llamada devuelve NixComponent directamente");
    assertF8(second instanceof CachedComp, "segunda llamada devuelve instancia de CachedComp");
    assertF8(importCount === 1, "importFn NO vuelve a llamarse (cache activo)");
    host1.remove();
    summaryDoneF8();
  });
}

// ── Demo Fase 8: suspend + lazy en acción ────────────────────────────────────
const demoF8 = document.getElementById("demo8")!;

// Simula un API con latencia configurable
function fakeApi<T>(data: T, delayMs = 800, shouldFail = false): Promise<T> {
  return new Promise((resolve, reject) =>
    setTimeout(() => shouldFail ? reject(new Error("API no disponible")) : resolve(data), delayMs)
  );
}

interface UserProfile { name: string; role: string; avatar: string; }

const demoDelay = signal(800);
const demoFail = signal(false);

// ── Slot donde se monta el suspend component ─────────────────────────────────
// (se añade al DOM antes de montar controles para mantener el orden visual)
const profileSlot = document.createElement("div");
const controlsSlot = document.createElement("div");
demoF8.appendChild(controlsSlot);
demoF8.appendChild(profileSlot);

let profileUnmount: (() => void) | null = null;

function refreshProfile() {
  if (profileUnmount) { profileUnmount(); profileUnmount = null; }

  const delay = demoDelay.value;
  const fail = demoFail.value;

  // mount(NixComponent, container) — va por el camino seguro:
  // onInit → render()._render() → postMountHooks → onMount()
  const handle = mount(
    suspend(
      () => fakeApi<UserProfile>(
        { name: "Deiver García", role: "Desarrollador Full Stack", avatar: "DG" },
        delay,
        fail
      ),
      (user) => html`
        <div style="display:flex;align-items:center;gap:12px;padding:14px;background:#0a0a0a;border-radius:8px;border:1px solid #262626">
          <div style="min-width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#38bdf8,#818cf8);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;font-size:16px">
            ${user.avatar}
          </div>
          <div>
            <div style="color:#f5f5f5;font-weight:600;font-size:15px">${user.name}</div>
            <div style="color:#71717a;font-size:13px;margin-top:2px">${user.role}</div>
          </div>
          <div style="margin-left:auto;color:#22c55e;font-size:12px;padding:3px 10px;border-radius:999px;background:#052e16;border:1px solid #166534">
            ✓ ${delay}ms
          </div>
        </div>
      `,
      {
        fallback: html`
          <div style="display:flex;align-items:center;gap:12px;padding:14px;background:#0a0a0a;border-radius:8px;border:1px solid #262626">
            <div style="min-width:48px;height:48px;border-radius:50%;background:#222;animation:nix-pulse 1.2s ease-in-out infinite"></div>
            <div style="flex:1;display:flex;flex-direction:column;gap:8px">
              <div style="height:14px;background:#222;border-radius:4px;width:55%;animation:nix-pulse 1.2s ease-in-out infinite"></div>
              <div style="height:12px;background:#222;border-radius:4px;width:38%;animation:nix-pulse 1.2s ease-in-out 0.15s infinite"></div>
            </div>
          </div>
          <style>@keyframes nix-pulse{0%,100%{opacity:.3}50%{opacity:.75}}</style>
        `,
        errorFallback: (err) => html`
          <div style="display:flex;align-items:center;gap:10px;padding:14px;background:#0a0a0a;border-radius:8px;border:1px solid #7f1d1d;color:#f87171;font-size:13px">
            <span style="font-size:18px">⚠</span>
            <span>${err instanceof Error ? err.message : String(err)}</span>
            <button style="margin-left:auto;font-size:12px;padding:2px 10px" @click=${refreshProfile}>Reintentar</button>
          </div>
        `,
      }
    ),
    profileSlot
  );
  profileUnmount = handle.unmount;
}

// ── Controles ─────────────────────────────────────────────────────────────────
mount(
  html`
    <div style="display:flex;align-items:center;flex-wrap:wrap;gap:16px;margin-bottom:12px">
      <label style="color:#a3a3a3;font-size:13px;display:flex;align-items:center;gap:8px">
        Latencia
        <input
          type="range" min="300" max="3000" step="100"
          value=${() => demoDelay.value}
          @input=${(e: Event) => { demoDelay.value = Number((e.target as HTMLInputElement).value); }}
          style="accent-color:#38bdf8;width:120px"
        />
        <code style="color:#38bdf8;min-width:42px">${() => demoDelay.value}ms</code>
      </label>
      <label style="color:#a3a3a3;font-size:13px;display:flex;align-items:center;gap:6px">
        <input
          type="checkbox"
          style="accent-color:#f87171"
          @change=${(e: Event) => { demoFail.value = (e.target as HTMLInputElement).checked; }}
        />
        Simular error
      </label>
      <button @click=${refreshProfile} style="padding:4px 14px;font-size:13px">↺ Cargar</button>
    </div>
  `,
  controlsSlot
);

// Primer render
refreshProfile();

// ╔══════════════════════════════════════════════════════════════
//  FASE 9: ref() — Referencias a elementos DOM
//  Tests → #tests9 | Summary → #summary9 | Demo → #demo9
// ══════════════════════════════════════════════════════════════
import { ref } from "./nix";

const testsF9 = document.getElementById("tests9")!;
const summaryF9 = document.getElementById("summary9")!;
let passF9 = 0, failF9 = 0;

function assertF9(condition: boolean, label: string) {
  const row = document.createElement("div");
  row.className = `test-line ${condition ? "pass" : "fail"}`;
  row.textContent = `${condition ? "✓" : "✗"} ${label}`;
  testsF9.appendChild(row);
  condition ? passF9++ : failF9++;
}
function groupF9(label: string) {
  const h = document.createElement("div");
  h.className = "test-group";
  h.textContent = label;
  testsF9.appendChild(h);
}

// ── Test 1: ref.el es null antes de montar ───────────────────────────────────
groupF9("ref — 1. ref.el es null antes de montar");
{
  const r = ref<HTMLSpanElement>();
  assertF9(r.el === null, "ref.el === null antes del mount");
}

// ── Test 2: ref.el apunta al elemento correcto tras montar ───────────────────
groupF9("ref — 2. ref.el apunta al elemento correcto tras montar");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = ref<HTMLSpanElement>();
  const handle = html`<span id="r2target" ref=${r}>hola</span>`.mount(host);
  assertF9(r.el !== null, "ref.el no es null tras mount");
  assertF9(r.el instanceof HTMLSpanElement, "ref.el es HTMLSpanElement");
  assertF9(r.el?.id === "r2target", "ref.el.id === 'r2target'");
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 3: ref.el vuelve a null tras desmontar ──────────────────────────────
groupF9("ref — 3. ref.el === null después de unmount");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const r = ref<HTMLDivElement>();
  const handle = html`<div ref=${r}>bye</div>`.mount(host);
  assertF9(r.el !== null, "ref asignado durante mount");
  handle.unmount();
  assertF9(r.el === null, "ref.el === null tras unmount");
  document.body.removeChild(host);
}

// ── Test 4: múltiples refs en el mismo template ──────────────────────────────
groupF9("ref — 4. Múltiples refs en el mismo template apuntan a elementos distintos");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const rA = ref<HTMLParagraphElement>();
  const rB = ref<HTMLButtonElement>();
  const handle = html`
    <p id="rA" ref=${rA}>A</p>
    <button id="rB" ref=${rB}>B</button>
  `.mount(host);
  assertF9(rA.el?.id === "rA", "rA apunta al <p#rA>");
  assertF9(rB.el?.id === "rB", "rB apunta al <button#rB>");
  assertF9(rA.el !== rB.el, "rA y rB son elementos distintos");
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 5: ref dentro de NixComponent — onMount puede usar el ref ───────────
groupF9("ref — 5. ref dentro de NixComponent disponible en onMount");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  let capturedEl: HTMLInputElement | null = null;

  class SearchBox extends NixComponent {
    inputRef = ref<HTMLInputElement>();
    override onMount() {
      capturedEl = this.inputRef.el;
    }
    override render() {
      return html`<input id="r5input" ref=${this.inputRef} type="text" />`;
    }
  }

  mount(new SearchBox(), host);
  const el5 = capturedEl as HTMLInputElement | null;
  assertF9(el5 !== null, "ref.el disponible en onMount");
  assertF9(el5?.tagName === "INPUT", "ref.el es un <input>");
  assertF9(el5?.id === "r5input", "ref.el.id === 'r5input'");
  document.body.removeChild(host);
}

// ── Test 6: ref en elemento condicional ──────────────────────────────────────
groupF9("ref — 6. ref en template condicional: asignado o null según visibilidad");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const show = signal(false);
  const r = ref<HTMLSpanElement>();

  // ref en el template que se monta / desmonta condicionalmente
  const outer = html`
    ${() => show.value
      ? html`<span id="r6span" ref=${r}>vis</span>`
      : null
    }
  `.mount(host);

  assertF9(r.el === null, "ref.el === null cuando el condicional es false");
  show.value = true;
  assertF9(r.el instanceof HTMLSpanElement, "ref.el asignado al mostrar el condicional");
  assertF9(r.el?.id === "r6span", "ref.el.id === 'r6span'");
  outer.unmount();
  document.body.removeChild(host);
}

// ── Test 7: ref en input — se puede llamar focus() ───────────────────────────
groupF9("ref — 7. ref en <input> permite llamar .focus() sin errores");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const inputRef = ref<HTMLInputElement>();
  const handle = html`<input id="r7input" ref=${inputRef} type="text" />`.mount(host);
  let ok = false;
  try {
    inputRef.el?.focus();
    ok = true;
  } catch { ok = false; }
  assertF9(ok, "focus() ejecutado sin lanzar excepción");
  assertF9(inputRef.el?.id === "r7input", "ref.el.id === 'r7input'");
  handle.unmount();
  document.body.removeChild(host);
}

// ── Resumen Fase 9 ────────────────────────────────────────────────────────────
const totalF9 = passF9 + failF9;
summaryF9.innerHTML = `<div class="summary ${failF9 === 0 ? 'all-pass' : 'has-fail'}">
  Fase 9 — ref(): ${passF9}/${totalF9} tests pasados ${failF9 === 0 ? "🎉" : `❌ ${failF9} fallaron`}
</div>`;

// ── Demo Interactivo Fase 9 ───────────────────────────────────────────────────
const demoF9 = document.getElementById("demo9")!;

class FocusDemo extends NixComponent {
  textRef = ref<HTMLInputElement>();
  colorRef = ref<HTMLInputElement>();
  result = signal("");

  override render() {
    return html`
      <div style="display:flex;flex-direction:column;gap:12px;max-width:400px">
        <label style="color:#a3a3a3;font-size:13px">
          Texto
          <input
            ref=${this.textRef}
            type="text"
            placeholder="escribe algo..."
            style="display:block;margin-top:4px;padding:6px 10px;background:#1e1e1e;
                   border:1px solid #444;border-radius:6px;color:#f1f5f9;width:100%"
          />
        </label>
        <label style="color:#a3a3a3;font-size:13px">
          Color de fondo
          <input
            ref=${this.colorRef}
            type="color"
            value="#1e293b"
            style="display:block;margin-top:4px;width:60px;height:32px;cursor:pointer"
          />
        </label>
        <div style="display:flex;gap:8px">
          <button
            @click=${() => this.textRef.el?.focus()}
            style="padding:6px 14px;font-size:13px"
          >Focus texto</button>
          <button
            @click=${() => {
        const text = this.textRef.el?.value ?? "";
        const color = this.colorRef.el?.value ?? "#1e293b";
        this.result.value = `"${text}" sobre ${color}`;
      }}
            style="padding:6px 14px;font-size:13px"
          >Capturar</button>
        </div>
        ${() => this.result.value
        ? html`
              <div style="padding:10px 14px;border-radius:8px;font-size:14px;
                          background:${this.colorRef.el?.value ?? '#1e293b'};color:#f1f5f9">
                ${() => this.result.value}
              </div>`
        : null
      }
      </div>
    `;
  }
}

mount(new FocusDemo(), demoF9);

// ╔══════════════════════════════════════════════════════════════
//  FASE 10: Event Modifiers
//  Tests → #tests10 | Summary → #summary10 | Demo → #demo10
// ══════════════════════════════════════════════════════════════

const testsF10 = document.getElementById("tests10")!;
const summaryF10 = document.getElementById("summary10")!;
let passF10 = 0, failF10 = 0;

function assertF10(condition: boolean, label: string) {
  const row = document.createElement("div");
  row.className = `test-line ${condition ? "pass" : "fail"}`;
  row.textContent = `${condition ? "✓" : "✗"} ${label}`;
  testsF10.appendChild(row);
  condition ? passF10++ : failF10++;
}
function groupF10(label: string) {
  const h = document.createElement("div");
  h.className = "test-group";
  h.textContent = label;
  testsF10.appendChild(h);
}

// ── Test 1: .prevent — llama preventDefault() ────────────────────────────────
groupF10("modifiers — 1. .prevent llama e.preventDefault()");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  let prevented = false;
  const handle = html`<a href="#" @click.prevent=${() => { }}>link</a>`.mount(host);
  const a = host.querySelector("a")!;
  a.addEventListener("click", (e) => { prevented = e.defaultPrevented; });
  a.click();
  assertF10(prevented, ".prevent: e.defaultPrevented === true");
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 2: .stop — llama stopPropagation() ──────────────────────────────────
groupF10("modifiers — 2. .stop detiene la propagación al padre");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  let parentFired = false;
  const handle = html`
    <div @click=${() => { parentFired = true; }}>
      <button @click.stop=${() => { }}>inner</button>
    </div>
  `.mount(host);
  host.querySelector("button")!.click();
  assertF10(!parentFired, ".stop: el evento no llegó al padre");
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 3: .once — el handler se dispara solo una vez ───────────────────────
groupF10("modifiers — 3. .once dispara el handler exactamente una vez");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  let count = 0;
  const handle = html`<button @click.once=${() => { count++; }}>btn</button>`.mount(host);
  const btn = host.querySelector("button")!;
  btn.click(); btn.click(); btn.click();
  assertF10(count === 1, `.once: handler llamado ${count} vez (se esperaba 1)`);
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 4: .self — solo dispara si el target es el propio elemento ──────────
groupF10("modifiers — 4. .self solo dispara cuando e.target === e.currentTarget");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  let outer = 0;
  const handle = html`
    <div @click.self=${() => { outer++; }}>
      <span id="inner10">child</span>
    </div>
  `.mount(host);
  // Click en el hijo → no debe disparar el handler .self
  host.querySelector("#inner10")!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  assertF10(outer === 0, ".self: click en hijo no dispara el handler");
  // Click en el propio div → sí debe disparar
  host.querySelector("div")!.dispatchEvent(new MouseEvent("click", { bubbles: false }));
  assertF10(outer === 1, ".self: click en el propio elemento dispara el handler");
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 5: .enter — solo dispara con tecla Enter ────────────────────────────
groupF10("modifiers — 5. .enter solo reacciona a la tecla Enter");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  let enterCount = 0;
  const handle = html`<input @keydown.enter=${() => { enterCount++; }} type="text" />`.mount(host);
  const input = host.querySelector("input")!;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
  assertF10(enterCount === 1, `.enter: handler disparado ${enterCount} vez (se esperaba 1)`);
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 6: .escape — solo dispara con tecla Escape ──────────────────────────
groupF10("modifiers — 6. .escape solo reacciona a la tecla Escape");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  let escCount = 0;
  const handle = html`<input @keydown.escape=${() => { escCount++; }} type="text" />`.mount(host);
  const input = host.querySelector("input")!;
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  assertF10(escCount === 1, `.escape: handler disparado ${escCount} vez (se esperaba 1)`);
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 7: .prevent.stop — múltiples modificadores combinados ───────────────
groupF10("modifiers — 7. Múltiples modificadores: .prevent.stop");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  let bubbled = false;
  const handle = html`
    <div @click=${() => { bubbled = true; }}>
      <a href="#" @click.prevent.stop=${() => { }}>link</a>
    </div>
  `.mount(host);
  const a = host.querySelector("a")!;
  let capturedEvent!: MouseEvent;
  a.addEventListener("click", (e) => { capturedEvent = e as MouseEvent; }, true);
  a.click();
  assertF10(!bubbled, ".prevent.stop: propagación detenida");
  assertF10(capturedEvent?.defaultPrevented === true, ".prevent.stop: default prevenido");
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 8: sin modifiers — comportamiento original sin cambios ───────────────
groupF10("modifiers — 8. Sin modificadores: comportamiento original intacto");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  let fired = false;
  const handle = html`<button @click=${() => { fired = true; }}>btn</button>`.mount(host);
  host.querySelector("button")!.click();
  assertF10(fired, "handler sin modificador ejecutado normalmente");
  handle.unmount();
  document.body.removeChild(host);
}

// ── Resumen Fase 10 ───────────────────────────────────────────────────────────
const totalF10 = passF10 + failF10;
summaryF10.innerHTML = `<div class="summary ${failF10 === 0 ? 'all-pass' : 'has-fail'}">
  Fase 10 — Event Modifiers: ${passF10}/${totalF10} tests pasados ${failF10 === 0 ? "🎉" : `❌ ${failF10} fallaron`}
</div>`;

// ── Demo Interactivo Fase 10 ──────────────────────────────────────────────────
const demoF10 = document.getElementById("demo10")!;

{
  const log = signal<string[]>([]);
  const addLog = (msg: string) => { log.value = [msg, ...log.value.slice(0, 9)]; };

  mount(html`
    <div style="display:flex;flex-direction:column;gap:14px;max-width:480px">

      <p style="color:#94a3b8;font-size:13px;margin:0">
        Cada botón/input demuestra un modificador distinto.
      </p>

      <!-- .prevent -->
      <label style="color:#a3a3a3;font-size:13px">
        <code style="color:#38bdf8">@click.prevent</code> en un enlace (no navega)
        <br/>
        <a
          href="https://example.com"
          @click.prevent=${() => addLog("click.prevent — navegación cancelada ✓")}
          style="color:#818cf8;cursor:pointer"
        >Clic aquí (no navega)</a>
      </label>

      <!-- .stop -->
      <label style="color:#a3a3a3;font-size:13px">
        <code style="color:#38bdf8">@click.stop</code> en botón interior (no propaga al div)
        <div
          @click=${() => addLog("click en PADRE disparado ✗")}
          style="padding:8px;border:1px dashed #475569;border-radius:6px;margin-top:4px"
        >
          <button
            @click.stop=${() => addLog("click.stop en hijo — padre no recibió el evento ✓")}
            style="padding:4px 12px"
          >Click (no propaga)</button>
        </div>
      </label>

      <!-- .once -->
      <label style="color:#a3a3a3;font-size:13px">
        <code style="color:#38bdf8">@click.once</code> — solo dispara una vez
        <br/>
        <button
          @click.once=${() => addLog("click.once — este mensaje solo aparece una vez ✓")}
          style="margin-top:4px;padding:4px 12px"
        >Click (once)</button>
      </label>

      <!-- .enter -->
      <label style="color:#a3a3a3;font-size:13px">
        <code style="color:#38bdf8">@keydown.enter</code> — solo reacciona a Enter
        <input
          type="text"
          placeholder="escribe y pulsa Enter..."
          @keydown.enter=${(e: Event) => addLog(`keydown.enter — "${(e.target as HTMLInputElement).value}" ✓`)}
          style="display:block;margin-top:4px;padding:6px 10px;width:100%;
                 background:#1e1e1e;border:1px solid #444;border-radius:6px;color:#f1f5f9"
        />
      </label>

      <!-- Log -->
      <div style="background:#0f172a;border-radius:8px;padding:10px 14px;min-height:60px">
        <p style="color:#475569;font-size:11px;margin:0 0 4px">Log (últimas 10 acciones):</p>
        ${() => log.value.length === 0
      ? html`<span style="color:#475569;font-size:13px">—</span>`
      : html`<ul style="margin:0;padding-left:16px;font-size:13px;color:#94a3b8">
              ${() => repeat(log.value, (_, i) => i, (msg) => html`<li>${msg}</li>`)}
            </ul>`
    }
      </div>

    </div>
  `, demoF10);
}

// ╔══════════════════════════════════════════════════════════════
//  FASE 11: watch() — Observadores reactivos
//  Tests → #tests11 | Summary → #summary11 | Demo → #demo11
// ══════════════════════════════════════════════════════════════
import { watch } from "./nix";

const testsF11 = document.getElementById("tests11")!;
const summaryF11 = document.getElementById("summary11")!;
let passF11 = 0, failF11 = 0;

function assertF11(condition: boolean, label: string) {
  const row = document.createElement("div");
  row.className = `test-line ${condition ? "pass" : "fail"}`;
  row.textContent = `${condition ? "✓" : "✗"} ${label}`;
  testsF11.appendChild(row);
  condition ? passF11++ : failF11++;
}
function groupF11(label: string) {
  const h = document.createElement("div");
  h.className = "test-group";
  h.textContent = label;
  testsF11.appendChild(h);
}

// ── Test 1: watch no llama callback al crearlo (lazy por defecto) ─────────────
groupF11("watch — 1. No llama callback al crear (lazy by default)");
{
  const s = signal(0);
  let calls = 0;
  const stop = watch(s, () => { calls++; });
  assertF11(calls === 0, "callback no llamado al crear el watcher");
  stop();
}

// ── Test 2: watch llama callback cuando la señal cambia ──────────────────────
groupF11("watch — 2. Llama callback cuando la señal cambia");
{
  const s = signal(0);
  let lastNew: number | undefined;
  let lastOld: number | undefined;
  const stop = watch(s, (n, o) => { lastNew = n; lastOld = o; });
  s.value = 42;
  assertF11(lastNew === 42, `newValue === 42 (fue ${lastNew})`);
  assertF11(lastOld === 0, `oldValue === 0  (fue ${lastOld})`);
  stop();
}

// ── Test 3: watch con getter compuesto ───────────────────────────────────────
groupF11("watch — 3. Getter compuesto: () => a.value + b.value");
{
  const a = signal(1);
  const b = signal(2);
  let result: number | undefined;
  const stop = watch(() => a.value + b.value, (n) => { result = n; });
  b.value = 10;
  assertF11(result === 11, `getter compuesto: resultado ${result} (se esperaba 11)`);
  stop();
}

// ── Test 4: immediate: true — llama callback con el valor actual ──────────────
groupF11("watch — 4. { immediate: true } llama callback de inmediato");
{
  const s = signal("hola");
  let calls = 0;
  let firstValue: string | undefined;
  const stop = watch(s, (n) => { calls++; firstValue = n; }, { immediate: true });
  assertF11(calls === 1, `immediate: callback llamado ${calls} vez antes de ningún cambio`);
  assertF11(firstValue === "hola", `immediate: firstValue === 'hola' (fue '${firstValue}')`);
  stop();
}

// ── Test 5: immediate + cambio posterior ─────────────────────────────────────
groupF11("watch — 5. { immediate: true } + cambio posterior");
{
  const s = signal(1);
  const history: number[] = [];
  const stop = watch(s, (n) => { history.push(n); }, { immediate: true });
  s.value = 2;
  s.value = 3;
  assertF11(history.length === 3, `3 llamadas: [${history}]`);
  assertF11(history[0] === 1 && history[1] === 2 && history[2] === 3,
    `valores correctos: [${history}]`);
  stop();
}

// ── Test 6: once: true — se detiene después del primer cambio ─────────────────
groupF11("watch — 6. { once: true } dispara solo en el primer cambio");
{
  const s = signal(0);
  let calls = 0;
  watch(s, () => { calls++; }, { once: true });
  s.value = 1;
  s.value = 2;
  s.value = 3;
  assertF11(calls <= 1, `once: callback llamado ${calls} vez/veces (se esperaba ≤1)`);
}

// ── Test 7: stop() detiene las actualizaciones ───────────────────────────────
groupF11("watch — 7. stop() detiene las actualizaciones");
{
  const s = signal(0);
  let calls = 0;
  const stop = watch(s, () => { calls++; });
  s.value = 1; // dispara
  stop();
  s.value = 2; // ya no debe disparar
  s.value = 3;
  assertF11(calls === 1, `stop(): solo 1 llamada antes del stop (fueron ${calls})`);
}

// ── Test 8: stop() — watcher no reactiva tras detenerse ──────────────────────
groupF11("watch — 8. Watcher no reactiva señales después de stop()");
{
  const s = signal("a");
  let val = "";
  const stop = watch(s, (n) => { val = n; });
  s.value = "b";
  assertF11(val === "b", "capturó 'b' antes del stop");
  stop();
  s.value = "c";
  assertF11(val === "b", "sigue siendo 'b' después del stop (no capturó 'c')");
}

// ── Resumen Fase 11 ───────────────────────────────────────────────────────────
const totalF11 = passF11 + failF11;
summaryF11.innerHTML = `<div class="summary ${failF11 === 0 ? 'all-pass' : 'has-fail'}">
  Fase 11 — watch(): ${passF11}/${totalF11} tests pasados ${failF11 === 0 ? "🎉" : `❌ ${failF11} fallaron`}
</div>`;

// ── Demo Interactivo Fase 11 ──────────────────────────────────────────────────
const demoF11 = document.getElementById("demo11")!;

{
  const price = signal(100);
  const qty = signal(1);
  const log = signal<string[]>([]);

  const addLog = (msg: string) =>
    (log.value = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log.value.slice(0, 14)]);

  // Observar el precio individualmente
  watch(price, (n, o) => addLog(`precio cambió: ${o} → ${n}`));

  // Observar el total (getter compuesto)
  watch(
    () => price.value * qty.value,
    (total, prev) => addLog(`total cambió: ${prev} → ${total} (${qty.value} × ${price.value})`)
  );

  mount(html`
    <div style="display:flex;flex-direction:column;gap:14px;max-width:460px">

      <p style="color:#94a3b8;font-size:13px;margin:0">
        Dos watchers activos: uno observa el precio, otro observa
        <code>precio × cantidad</code>.
      </p>

      <label style="color:#a3a3a3;font-size:13px">
        Precio: <code style="color:#38bdf8">${() => price.value}</code>
        <input type="range" min="10" max="500" step="10"
          value=${() => price.value}
          @input=${(e: Event) => { price.value = Number((e.target as HTMLInputElement).value); }}
          style="display:block;margin-top:4px;width:100%;accent-color:#38bdf8"
        />
      </label>

      <label style="color:#a3a3a3;font-size:13px">
        Cantidad: <code style="color:#38bdf8">${() => qty.value}</code>
        <input type="range" min="1" max="20"
          value=${() => qty.value}
          @input=${(e: Event) => { qty.value = Number((e.target as HTMLInputElement).value); }}
          style="display:block;margin-top:4px;width:100%;accent-color:#a78bfa"
        />
      </label>

      <div style="padding:8px 14px;background:#0f172a;border-radius:8px;font-size:14px;color:#f1f5f9">
        Total: <strong style="color:#34d399">${() => price.value * qty.value}</strong>
      </div>

      <div style="background:#0f172a;border-radius:8px;padding:10px 14px;min-height:60px">
        <p style="color:#475569;font-size:11px;margin:0 0 4px">Log de cambios:</p>
        ${() => log.value.length === 0
      ? html`<span style="color:#475569;font-size:13px">—</span>`
      : html`<ul style="margin:0;padding-left:16px;font-size:12px;color:#94a3b8;font-family:monospace">
              ${() => repeat(log.value, (_, i) => i, (msg) => html`<li>${msg}</li>`)}
            </ul>`
    }
      </div>

    </div>
  `, demoF11);
}

// ╔══════════════════════════════════════════════════════════════
//  FASE 12: nextTick() — Microtask hook
//  Tests → #tests12 | Summary → #summary12 | Demo → #demo12
// ══════════════════════════════════════════════════════════════
import { nextTick } from "./nix";

const testsF12 = document.getElementById("tests12")!;
const summaryF12 = document.getElementById("summary12")!;
let passF12 = 0, failF12 = 0;

function assertF12(condition: boolean, label: string) {
  const row = document.createElement("div");
  row.className = `test-line ${condition ? "pass" : "fail"}`;
  row.textContent = `${condition ? "✓" : "✗"} ${label}`;
  testsF12.appendChild(row);
  condition ? passF12++ : failF12++;
}
function groupF12(label: string) {
  const h = document.createElement("div");
  h.className = "test-group";
  h.textContent = label;
  testsF12.appendChild(h);
}

// Los tests de nextTick son asíncronos; los ejecutamos y escribimos el
// resumen cuando todos terminan.
(async () => {

  // ── Test 1: nextTick() retorna una promesa ────────────────────────────────────
  groupF12("nextTick — 1. Retorna una Promise");
  {
    const p = nextTick();
    assertF12(p instanceof Promise, "nextTick() instanceof Promise");
    await p;
  }

  // ── Test 2: nextTick() resuelve después del tick síncrono ────────────────────
  groupF12("nextTick — 2. El código tras 'await nextTick()' corre después del tick síncrono");
  {
    const order: string[] = [];
    const run = async () => {
      order.push("before");
      await nextTick();
      order.push("after");
    };
    const p = run();
    order.push("sync"); // esto corre ANTES de que el await resuelva
    await p;
    assertF12(
      order[0] === "before" && order[1] === "sync" && order[2] === "after",
      `orden correcto: [${order.join(", ")}]`
    );
  }

  // ── Test 3: DOM actualizado después de nextTick ───────────────────────────────
  groupF12("nextTick — 3. DOM refleja cambios reactivos después de await nextTick()");
  {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const name = signal("Ana");
    const handle = html`<span id="nt3">${() => name.value}</span>`.mount(host);

    // En Nix.js los efectos son síncronos, así que el DOM ya está actualizado
    // antes del nextTick, pero nextTick garantiza que cualquier efecto
    // encolado (ej. batch) también haya terminado.
    name.value = "Bea";
    await nextTick();
    assertF12(
      host.querySelector("#nt3")?.textContent === "Bea",
      `textContent === 'Bea' tras nextTick (fue '${host.querySelector("#nt3")?.textContent}')`
    );
    handle.unmount();
    document.body.removeChild(host);
  }

  // ── Test 4: nextTick(callback) ejecuta fn en microtask ───────────────────────
  groupF12("nextTick — 4. nextTick(fn) ejecuta el callback en el microtask");
  {
    const order: string[] = [];
    await new Promise<void>(resolve => {
      nextTick(() => { order.push("tick"); resolve(); });
      order.push("sync");
    });
    assertF12(
      order[0] === "sync" && order[1] === "tick",
      `orden correcto: [${order.join(", ")}]`
    );
  }

  // ── Test 5: batch + nextTick — efectos resueltos antes de nextTick ────────────
  groupF12("nextTick — 5. Tras batch(), los efectos ya corrieron al hacer await nextTick()");
  {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const a = signal(1);
    const b = signal(2);
    const handle = html`<span id="nt5">${() => a.value + b.value}</span>`.mount(host);

    batch(() => {
      a.value = 10;
      b.value = 20;
    });
    await nextTick();
    assertF12(
      host.querySelector("#nt5")?.textContent === "30",
      `batch result === '30' tras nextTick (fue '${host.querySelector("#nt5")?.textContent}')`
    );
    handle.unmount();
    document.body.removeChild(host);
  }

  // ── Test 6: múltiples nextTick encadenados ────────────────────────────────────
  groupF12("nextTick — 6. Múltiples await nextTick() encadenados resuelven en orden");
  {
    const ticks: number[] = [];
    nextTick(() => ticks.push(1));
    nextTick(() => ticks.push(2));
    nextTick(() => ticks.push(3));
    await nextTick(); // espera al menos un microtask
    await nextTick(); // los tres callbacks ya resolvieron
    assertF12(ticks.length === 3, `3 callbacks ejecutados (fueron ${ticks.length})`);
    assertF12(ticks[0] === 1 && ticks[1] === 2 && ticks[2] === 3,
      `orden correcto: [${ticks.join(", ")}]`);
  }

  // ── Resumen Fase 12 ───────────────────────────────────────────────────────────
  const totalF12 = passF12 + failF12;
  summaryF12.innerHTML = `<div class="summary ${failF12 === 0 ? 'all-pass' : 'has-fail'}">
  Fase 12 — nextTick(): ${passF12}/${totalF12} tests pasados ${failF12 === 0 ? "🎉" : `❌ ${failF12} fallaron`}
</div>`;

  // ── Demo Interactivo Fase 12 ──────────────────────────────────────────────────
  const demoF12 = document.getElementById("demo12")!;

  {
    const inputRef = ref<HTMLInputElement>();
    const items = signal<string[]>(["Manzana", "Banana"]);
    const newItem = signal("");
    const lastAdded = signal("");

    const addItem = async () => {
      const val = newItem.value.trim();
      if (!val) return;
      items.value = [...items.value, val];
      lastAdded.value = val;
      newItem.value = "";
      // Tras nextTick el DOM ya reflejó la lista nueva
      await nextTick();
      inputRef.el?.focus();
    };

    mount(html`
    <div style="display:flex;flex-direction:column;gap:12px;max-width:360px">
      <p style="color:#94a3b8;font-size:13px;margin:0">
        Escribe un elemento, pulsa Añadir (o Enter).
        Después de agregar, el campo recupera el foco automáticamente
        gracias a <code>await nextTick()</code> antes de <code>focus()</code>.
      </p>

      <div style="display:flex;gap:8px">
        <input
          ref=${inputRef}
          type="text"
          placeholder="Nuevo elemento..."
          value=${() => newItem.value}
          @input=${(e: Event) => { newItem.value = (e.target as HTMLInputElement).value; }}
          @keydown.enter=${addItem}
          style="flex:1;padding:6px 10px;background:#1e1e1e;
                 border:1px solid #444;border-radius:6px;color:#f1f5f9"
        />
        <button @click=${addItem} style="padding:6px 14px;font-size:13px">Añadir</button>
      </div>

      ${() => lastAdded.value
        ? html`<p style="color:#86efac;font-size:13px;margin:0">
            ✓ Añadido: <strong>${() => lastAdded.value}</strong>
            — foco restaurado vía <code>nextTick</code>
          </p>`
        : null
      }

      <ul style="margin:0;padding-left:18px;color:#cbd5e1;font-size:14px">
        ${() => repeat(
        items.value,
        (item) => item,
        (item) => html`<li>${item}</li>`
      )}
      </ul>
    </div>
  `, demoF12);
  }

})(); // fin bloque async

// ╔══════════════════════════════════════════════════════════════
//  FASE 13: provide() / inject() — Inyección de dependencias
//  Tests → #tests13 | Summary → #summary13 | Demo → #demo13
// ══════════════════════════════════════════════════════════════
import { provide, inject, createInjectionKey } from "./nix";
import type { InjectionKey } from "./nix";

const testsF13 = document.getElementById("tests13")!;
const summaryF13 = document.getElementById("summary13")!;
let passF13 = 0, failF13 = 0;

function assertF13(condition: boolean, label: string) {
  const row = document.createElement("div");
  row.className = `test-line ${condition ? "pass" : "fail"}`;
  row.textContent = `${condition ? "✓" : "✗"} ${label}`;
  testsF13.appendChild(row);
  condition ? passF13++ : failF13++;
}
function groupF13(label: string) {
  const h = document.createElement("div");
  h.className = "test-group";
  h.textContent = label;
  testsF13.appendChild(h);
}

// ── Test 1: inject fuera de un componente retorna undefined ──────────────────
// (ejecutado a nivel módulo, fuera de cualquier render)
groupF13("inject — 1. inject() fuera de render retorna undefined");
{
  const K = createInjectionKey<number>("k1");
  assertF13(inject(K) === undefined, "inject fuera de componente === undefined");
}

// ── Test 2: provide + inject en jerarquía directa padre → hijo ───────────────
groupF13("provide/inject — 2. Hijo inyecta valor provisto por el padre");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const COLOR_KEY: InjectionKey<string> = createInjectionKey("color");
  let received: string | undefined;

  class Child13 extends NixComponent {
    color = inject(COLOR_KEY);
    override onInit() { received = this.color; }
    override render() { return html`<span id="t13c2">${this.color ?? "none"}</span>`; }
  }
  class Parent13 extends NixComponent {
    override onInit() { provide(COLOR_KEY, "crimson"); }
    override render() { return html`<div>${new Child13()}</div>`; }
  }

  const handle = mount(new Parent13(), host);
  assertF13(received === "crimson", `hijo recibio '${received}' (se esperaba 'crimson')`);
  assertF13(host.querySelector("#t13c2")?.textContent === "crimson", "DOM muestra el valor inyectado");
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 3: inject a través de múltiples niveles (abuelo → padre → hijo) ─────
groupF13("provide/inject — 3. Inyección a través de múltiples niveles");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const LANG_KEY: InjectionKey<string> = createInjectionKey("lang");
  let deepValue: string | undefined;

  class DeepChild extends NixComponent {
    lang = inject(LANG_KEY);
    override onInit() { deepValue = this.lang; }
    override render() { return html`<em id="t13c3">${this.lang ?? "?"}</em>`; }
  }
  class Middle extends NixComponent {
    override render() { return html`<div>${new DeepChild()}</div>`; }
  }
  class GrandParent extends NixComponent {
    override onInit() { provide(LANG_KEY, "es"); }
    override render() { return html`<div>${new Middle()}</div>`; }
  }

  const handle = mount(new GrandParent(), host);
  assertF13(deepValue === "es", `nieto recibio '${deepValue}' (se esperaba 'es')`);
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 4: hijo anula el provide del padre (override más cercano) ──────────
groupF13("provide/inject — 4. Override: hijo provee otro valor, nieto ve el del hijo");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const THEME_KEY2: InjectionKey<string> = createInjectionKey("theme2");
  let grandchildValue: string | undefined;

  class GrandChild4 extends NixComponent {
    t = inject(THEME_KEY2);
    override onInit() { grandchildValue = this.t; }
    override render() { return html`<span>${this.t}</span>`; }
  }
  class Child4 extends NixComponent {
    override onInit() { provide(THEME_KEY2, "light"); } // anula "dark" del padre
    override render() { return html`<div>${new GrandChild4()}</div>`; }
  }
  class Parent4 extends NixComponent {
    override onInit() { provide(THEME_KEY2, "dark"); }
    override render() { return html`<div>${new Child4()}</div>`; }
  }

  const handle = mount(new Parent4(), host);
  assertF13(grandchildValue === "light",
    `nieto ve '${grandchildValue}', no el del abuelo (se esperaba 'light')`);
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 5: claves distintas no se confunden ─────────────────────────────────
groupF13("provide/inject — 5. Claves distintas no se confunden");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const KEY_A: InjectionKey<string> = createInjectionKey("a");
  const KEY_B: InjectionKey<number> = createInjectionKey("b");
  let valA: string | undefined;
  let valB: number | undefined;

  class Consumer5 extends NixComponent {
    override onInit() { valA = inject(KEY_A); valB = inject(KEY_B); }
    override render() { return html`<span></span>`; }
  }
  class Provider5 extends NixComponent {
    override onInit() { provide(KEY_A, "hello"); provide(KEY_B, 42); }
    override render() { return html`<div>${new Consumer5()}</div>`; }
  }

  const handle = mount(new Provider5(), host);
  assertF13(valA === "hello" && valB === 42,
    `KEY_A='${valA}' KEY_B=${valB} (se esperaba 'hello' y 42)`);
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 6: provide con Signal — cambios reactivos llegan al hijo ────────────
groupF13("provide/inject — 6. Signal provista: cambios reactivos llegan al consumidor");
{
  const host = document.createElement("div");
  document.body.appendChild(host);
  const SIG_KEY: InjectionKey<ReturnType<typeof signal<number>>> =
    createInjectionKey("sig");

  class Comp6 extends NixComponent {
    counter = inject(SIG_KEY)!;
    override render() { return html`<span id="t13c6">${() => this.counter.value}</span>`; }
  }
  const sharedCount = signal(0);
  class Prov6 extends NixComponent {
    override onInit() { provide(SIG_KEY, sharedCount); }
    override render() { return html`<div>${new Comp6()}</div>`; }
  }

  const handle = mount(new Prov6(), host);
  assertF13(host.querySelector("#t13c6")?.textContent === "0", "valor inicial 0");
  sharedCount.value = 7;
  assertF13(host.querySelector("#t13c6")?.textContent === "7",
    `DOM actualizado a 7 (fue '${host.querySelector("#t13c6")?.textContent}')`);
  handle.unmount();
  document.body.removeChild(host);
}

// ── Test 7: provide() fuera de componente lanza error ───────────────────────
groupF13("provide — 7. provide() fuera de componente lanza Error");
{
  const K = createInjectionKey<string>("k7");
  let threw = false;
  try { provide(K, "x"); } catch { threw = true; }
  assertF13(threw, "provide() fuera de componente lanzó Error");
}

// ── Resumen Fase 13 ───────────────────────────────────────────────────────────
const totalF13 = passF13 + failF13;
summaryF13.innerHTML = `<div class="summary ${failF13 === 0 ? 'all-pass' : 'has-fail'}">
  Fase 13 — provide/inject: ${passF13}/${totalF13} tests pasados ${failF13 === 0 ? "🎉" : `❌ ${failF13} fallaron`}
</div>`;

// ── Demo Interactivo Fase 13 ──────────────────────────────────────────────────
const demoF13 = document.getElementById("demo13")!;

{
  // Clave global
  const THEME_KEY: InjectionKey<ReturnType<typeof signal<string>>> =
    createInjectionKey("demo13-theme");

  // ── Componentes consumidores (no saben de dónde viene el tema)
  class ThemedCard extends NixComponent {
    theme = inject(THEME_KEY)!;
    override render() {
      const style = () => {
        const dark = this.theme.value === "dark";
        return `padding:12px 16px;border-radius:8px;font-size:14px;transition:all .2s;
                border:1px solid ${dark ? "#334155" : "#bae6fd"};
                background:${dark ? "#1e293b" : "#f0f9ff"};
                color:${dark ? "#f1f5f9" : "#0f172a"}`;
      };
      return html`
        <div style=${style}>
          <strong>ThemedCard</strong> — tema actual:
          <code style="color:#38bdf8">${() => this.theme.value}</code>
        </div>
      `;
    }
  }

  class ThemedBadge extends NixComponent {
    theme = inject(THEME_KEY)!;
    override render() {
      const style = () =>
        `display:inline-block;padding:2px 10px;border-radius:9999px;font-size:12px;
         font-weight:600;color:#fff;
         background:${this.theme.value === 'dark' ? '#0ea5e9' : '#7c3aed'}`;
      return html`
        <span style=${style}>
          ${() => this.theme.value === "dark" ? "🌙 Dark" : "☀️ Light"}
        </span>
      `;
    }
  }

  // ── Proveedor raíz
  class ThemeProvider extends NixComponent {
    theme = signal("dark");
    override onInit() { provide(THEME_KEY, this.theme); }

    override render() {
      return html`
        <div style="display:flex;flex-direction:column;gap:14px;max-width:440px">
          <p style="color:#94a3b8;font-size:13px;margin:0">
            <code>ThemeProvider</code> provee la señal <code>theme</code>.
            Los componentes hijos la inyectan sin recibir props.
          </p>

          <div style="display:flex;align-items:center;gap:12px">
            <span style="color:#a3a3a3;font-size:13px">Tema:</span>
            <button
              @click=${() => { this.theme.value = this.theme.value === "dark" ? "light" : "dark"; }}
              style="padding:5px 14px;font-size:13px">Cambiar tema</button>
            ${new ThemedBadge()}
          </div>

          ${new ThemedCard()}

          <div style="color:#475569;font-size:12px">
            Ambos componentes leen el mismo
            <code>inject(THEME_KEY)</code> sin que <code>ThemeProvider</code>
            les pase nada explícitamente.
          </div>
        </div>
      `;
    }
  }

  mount(new ThemeProvider(), demoF13);
}

// ══════════════════════════════════════════════════════════════
//  FASE 15: Forms
//  Tests → #tests15 | Summary → #summary15 | Demo → #demo15
// ══════════════════════════════════════════════════════════════
import {
  useField, createForm,
  required, minLength, maxLength, email, min, max,
} from "./nix";
import type { FieldState } from "./nix";

{
  const testsEl = document.getElementById("tests15")!;
  const summaryEl = document.getElementById("summary15")!;
  let pass = 0, fail = 0;

  function assert15(condition: boolean, label: string) {
    const row = document.createElement("div");
    row.className = `test-line ${condition ? "pass" : "fail"}`;
    row.textContent = `${condition ? "✅" : "❌"} ${label}`;
    testsEl.appendChild(row);
    if (condition) pass++; else { fail++; console.error("❌ F15:", label); }
  }

  // Helper: simulate typing into a field
  function type(field: FieldState<unknown>, value: string, inputType = "text") {
    const el = Object.assign(document.createElement("input"), { value, type: inputType });
    field.onInput({ target: el } as unknown as Event);
  }
  function blur(field: FieldState<unknown>) { field.onBlur(); }
  // ── useField ─────────────────────────────────────────────────────────────
  const f1 = useField("hello");
  assert15(f1.value.value === "hello", "useField — initial value");
  assert15(!f1.touched.value, "useField — not touched initially");
  assert15(!f1.dirty.value, "useField — not dirty initially");
  assert15(f1.error.value === null, "useField — no error before interaction");

  const f2 = useField("", [required()]);
  blur(f2);
  assert15(f2.error.value === "Required", "useField — error shows after blur");

  type(f2, "hello");
  assert15(f2.error.value === null, "useField — error clears when valid value entered");
  assert15(f2.dirty.value, "useField — dirty after input");

  f2.reset();
  assert15(f2.value.value === "", "useField — reset restores initial value");
  assert15(!f2.touched.value, "useField — reset clears touched");
  assert15(f2.error.value === null, "useField — error hidden after reset");

  // ── Built-in validators ──────────────────────────────────────────────────
  const fMin = useField("", [minLength(3)]);
  blur(fMin); type(fMin, "ab");
  assert15(fMin.error.value !== null, "minLength — fails when too short");
  type(fMin, "abc");
  assert15(fMin.error.value === null, "minLength — passes at exact length");

  const fMax = useField("", [maxLength(3)]);
  blur(fMax); type(fMax, "abcd");
  assert15(fMax.error.value !== null, "maxLength — fails when too long");

  const fEmail = useField("", [email()]);
  blur(fEmail); type(fEmail, "notanemail");
  assert15(fEmail.error.value !== null, "email — fails for invalid email");
  type(fEmail, "test@example.com");
  assert15(fEmail.error.value === null, "email — passes for valid email");

  const fNum = useField<number>(0, [min(18), max(120)]);
  blur(fNum);
  fNum.value.value = 10;
  assert15(fNum.error.value !== null, "min — fails below minimum");
  fNum.value.value = 18;
  fNum.dirty.value = true;
  assert15(fNum.error.value === null, "min — passes at minimum");
  fNum.value.value = 200;
  assert15(fNum.error.value !== null, "max — fails above maximum");

  // ── External error injection (_setExternalError) ─────────────────────────
  const fExt = useField("ok");
  fExt._setExternalError("Server error");
  assert15(fExt.error.value === "Server error", "_setExternalError — injects external error");
  assert15(fExt.touched.value, "_setExternalError — marks field as touched");
  type(fExt, "new value");
  assert15(fExt.error.value === null, "_setExternalError — clears when user re-types");

  // ── createForm ───────────────────────────────────────────────────────────
  const form1 = createForm({ name: "", email: "" });
  assert15("name" in form1.fields && "email" in form1.fields, "createForm — creates fields for all keys");

  // handleSubmit — preventDefault
  let prevented = false;
  const fakeEv = { preventDefault: () => { prevented = true; } } as unknown as Event;
  form1.handleSubmit(() => { })(fakeEv);
  assert15(prevented, "handleSubmit — calls preventDefault");

  // handleSubmit — calls fn when no validators + fields untouched
  let called = false;
  const form2 = createForm({ x: "hello" });
  form2.handleSubmit(() => { called = true; })(fakeEv);
  assert15(called, "handleSubmit — calls fn when form has no validators");

  // handleSubmit — does NOT call fn when validators fail
  let called3 = false;
  const form3 = createForm({ name: "" }, { validators: { name: [required()] } });
  form3.handleSubmit(() => { called3 = true; })(fakeEv);
  assert15(!called3, "handleSubmit — does NOT call fn when built-in validators fail");
  assert15(form3.fields.name.error.value !== null, "handleSubmit — touches all fields showing errors");

  // handleSubmit — external validate (Zod-style)
  let called4 = false;
  const form4 = createForm(
    { name: "valid name" },
    { validate: () => ({ name: "Server says no" }) }
  );
  form4.handleSubmit(() => { called4 = true; })(fakeEv);
  assert15(!called4, "handleSubmit — does NOT call fn when schema validate returns errors");
  assert15(form4.fields.name.error.value === "Server says no", "handleSubmit — injects schema errors into fields");

  // setErrors
  const form5 = createForm({ email: "" });
  form5.setErrors({ email: "Email taken" });
  assert15(form5.fields.email.error.value === "Email taken", "setErrors — injects external error into field");
  type(form5.fields.email, "new@email.com");
  assert15(form5.fields.email.error.value === null, "setErrors — clears when user re-types");

  // values computed
  const form6 = createForm({ a: "x", b: "y" });
  form6.fields.a.value.value = "changed";
  assert15(form6.values.value.a === "changed", "values — reactive snapshot updates");

  // dirty signal
  const form7 = createForm({ x: "" });
  assert15(!form7.dirty.value, "dirty — false initially");
  type(form7.fields.x, "abc");
  assert15(form7.dirty.value, "dirty — true after input");

  // reset
  form7.reset();
  assert15(!form7.dirty.value, "reset — dirty cleared");
  assert15(form7.fields.x.value.value === "", "reset — value restored");

  // ── Summary ───────────────────────────────────────────────────────────────
  summaryEl.textContent = `${pass} passed, ${fail} failed`;
  summaryEl.className = fail === 0 ? "pass" : "fail";

  // ── Demo — Registration form ──────────────────────────────────────────────
  const demoEl = document.getElementById("demo15")!;

  const regForm = createForm(
    { name: "", email: "", age: 18, password: "", confirm: "" },
    {
      validators: {
        name: [required(), minLength(3), maxLength(30)],
        email: [required(), email()],
        age: [required(), min(18, "Must be at least 18 years old"), max(120)],
        password: [required(), minLength(8, "At least 8 characters")],
      },
      validate(values) {
        if (values.confirm !== values.password) return { confirm: "Passwords do not match" };
        return null;
      },
    }
  );

  const submitted = signal<null | typeof regForm.values.value>(null);

  // ── Field row helper ──────────────────────────────────────────────────────
  function fieldRow(
    label: string,
    field: FieldState<string | number>,
    inputType = "text"
  ) {
    return html`
      <div style="display:flex;flex-direction:column;gap:4px">
        <label style="font-size:13px;color:#94a3b8">${label}</label>
        <input
          type=${inputType}
          value=${() => String(field.value.value)}
          @input=${field.onInput}
          @blur=${field.onBlur}
          style=${() => `
            padding:8px 10px;border-radius:6px;font-size:14px;
            background:#1e293b;color:#e2e8f0;
            border:1px solid ${field.error.value ? "#ef4444" : field.dirty.value ? "#22c55e" : "#334155"};
            outline:none;width:100%;box-sizing:border-box
          `}
        />
        ${() => field.error.value
        ? html`<p style="margin:0;font-size:12px;color:#f87171">${field.error.value}</p>`
        : null}
      </div>
    `;
  }

  mount(html`
    <div style="max-width:420px">
      ${() => submitted.value
      ? html`
            <div style="padding:18px;border-radius:8px;background:#14532d;border:1px solid #22c55e;color:#bbf7d0">
              <strong>✅ Registered successfully!</strong>
              <pre style="margin:10px 0 0;font-size:12px;color:#86efac">${() => JSON.stringify(submitted.value, null, 2)}</pre>
            </div>
          `
      : html`
            <form @submit=${regForm.handleSubmit((v) => { submitted.value = v; })}
                  style="display:flex;flex-direction:column;gap:14px">

              ${fieldRow("Full name", regForm.fields.name)}
              ${fieldRow("Email", regForm.fields.email, "email")}
              ${fieldRow("Age", regForm.fields.age as FieldState<string | number>, "number")}
              ${fieldRow("Password", regForm.fields.password, "password")}
              ${fieldRow("Confirm password", regForm.fields.confirm as FieldState<string | number>, "password")}

              <div style="display:flex;gap:10px;align-items:center">
                <button
                  type="submit"
                  style="padding:9px 20px;font-size:14px;border-radius:6px;
                         background:#3b82f6;color:#fff;border:none;cursor:pointer"
                >Register</button>
                <button
                  type="button"
                  @click=${() => { regForm.reset(); submitted.value = null; }}
                  style="padding:9px 20px;font-size:14px;border-radius:6px;
                         background:#1e293b;color:#94a3b8;border:1px solid #334155;cursor:pointer"
                >Reset</button>
              </div>

              <p style="font-size:12px;color:#475569;margin:0">
                Try submitting empty — errors appear. Then fill valid data and submit again.
              </p>
            </form>
          `}
    </div>
  `, demoEl);
}

// ══════════════════════════════════════════════════════════════
//  FASE 14: Children & Slots
//  Tests → #tests14 | Summary → #summary14 | Demo → #demo14
// ══════════════════════════════════════════════════════════════
import type { NixChildren } from "./nix";

{
  const testsEl = document.getElementById("tests14")!;
  const summaryEl = document.getElementById("summary14")!;
  let pass = 0, fail = 0;

  function assert14(condition: boolean, label: string) {
    const row = document.createElement("div");
    row.className = `test-line ${condition ? "pass" : "fail"}`;
    row.textContent = `${condition ? "✅" : "❌"} ${label}`;
    testsEl.appendChild(row);
    if (condition) pass++; else { fail++; console.error("❌ F14:", label); }
  }

  // ── TEST 1: children en class component ──────────────────────────────────
  class Box extends NixComponent {
    override render() {
      return html`<div class="box">${this.children}</div>`;
    }
  }

  const div14a = document.createElement("div");
  new Box().setChildren(html`<span id="child14a">hola</span>`).render().mount(div14a);
  assert14(!!div14a.querySelector("#child14a"), "class component — children default slot se renderiza");

  // ── TEST 2: named slots ───────────────────────────────────────────────────
  class TwoSlot extends NixComponent {
    override render() {
      return html`
        <div>
          <header>${this.slot("header")}</header>
          <main>${this.children}</main>
          <footer>${this.slot("footer")}</footer>
        </div>
      `;
    }
  }

  const div14b = document.createElement("div");
  new TwoSlot()
    .setSlot("header", html`<h1 id="slot-header">Cabecera</h1>`)
    .setChildren(html`<p id="slot-body">Cuerpo</p>`)
    .setSlot("footer", html`<small id="slot-footer">Pie</small>`)
    .render()
    .mount(div14b);

  assert14(!!div14b.querySelector("#slot-header"), "named slot 'header' se renderiza");
  assert14(!!div14b.querySelector("#slot-body"), "children (default slot) se renderiza junto a named slots");
  assert14(!!div14b.querySelector("#slot-footer"), "named slot 'footer' se renderiza");

  // ── TEST 3: children en función componente ────────────────────────────────
  function FnCard({ children }: { children?: NixChildren }) {
    return html`<article class="fn-card">${children}</article>`;
  }

  const div14c = document.createElement("div");
  FnCard({ children: html`<span id="fn-child">fn children</span>` }).mount(div14c);
  assert14(!!div14c.querySelector("#fn-child"), "function component — children como prop funciona");

  // ── TEST 4: children puede ser un NixComponent ────────────────────────────
  class Inner extends NixComponent {
    override render() { return html`<b id="inner-comp">inner</b>`; }
  }

  const div14d = document.createElement("div");
  new Box().setChildren(new Inner()).render().mount(div14d);
  assert14(!!div14d.querySelector("#inner-comp"), "children puede ser un NixComponent");

  // ── TEST 5: slot vacío no rompe ──────────────────────────────────────────
  const div14e = document.createElement("div");
  let threw = false;
  try {
    new TwoSlot().render().mount(div14e); // sin setSlot ni setChildren
  } catch { threw = true; }
  assert14(!threw, "slot vacío (undefined) no lanza error");

  // ── TEST 6: setChildren es fluido (retorna this) ──────────────────────────
  const box = new Box();
  assert14(box.setChildren(html`<span>x</span>`) === box, "setChildren() retorna this (fluent API)");

  // ── TEST 7: setSlot es fluido ─────────────────────────────────────────────
  const ts = new TwoSlot();
  assert14(ts.setSlot("header", html`<h1>h</h1>`) === ts, "setSlot() retorna this (fluent API)");

  // ── TEST 8: children array ────────────────────────────────────────────────
  const div14f = document.createElement("div");
  new Box().setChildren([
    html`<span id="arr-a">A</span>`,
    html`<span id="arr-b">B</span>`,
  ]).render().mount(div14f);
  assert14(!!div14f.querySelector("#arr-a") && !!div14f.querySelector("#arr-b"),
    "children acepta array de templates");

  // ── TEST 9: children con señales reactivas ────────────────────────────────
  const reactive14 = signal("v1");
  const div14g = document.createElement("div");
  new Box().setChildren(html`<span id="react-child">${() => reactive14.value}</span>`).render().mount(div14g);
  assert14(div14g.querySelector("#react-child")?.textContent === "v1", "children reactivos muestran valor inicial");
  reactive14.value = "v2";
  assert14(div14g.querySelector("#react-child")?.textContent === "v2", "children reactivos actualizan al cambiar señal");

  // ── Summary ───────────────────────────────────────────────────────────────
  summaryEl.textContent = `${pass} passed, ${fail} failed`;
  summaryEl.className = fail === 0 ? "pass" : "fail";

  // ── Demo ──────────────────────────────────────────────────────────────────
  const demoEl = document.getElementById("demo14")!;

  class DemoCard extends NixComponent {
    override render() {
      return html`
        <div style="border:1px solid #334155;border-radius:8px;overflow:hidden;max-width:360px">
          <div style="background:#1e293b;padding:12px 16px;font-weight:600;color:#e2e8f0">
            ${this.slot("header") ?? html`<span style="color:#64748b">(sin header)</span>`}
          </div>
          <div style="padding:14px 16px;color:#cbd5e1">
            ${this.children ?? html`<span style="color:#64748b">(sin children)</span>`}
          </div>
          <div style="background:#0f172a;padding:8px 16px;font-size:12px;color:#475569">
            ${this.slot("footer") ?? html`<span>(sin footer)</span>`}
          </div>
        </div>
      `;
    }
  }

  const activeTab = signal(0);

  const tabs = [
    { label: "Solo children" },
    { label: "Header + children" },
    { label: "Todo" },
  ];

  function renderDemo() {
    const idx = activeTab.value;
    const card = new DemoCard();
    if (idx >= 1) card.setSlot("header", html`<span>🃏 Título del card</span>`);
    if (idx >= 0) card.setChildren(html`<p style="margin:0">Contenido del <strong>slot default</strong>.</p>`);
    if (idx >= 2) card.setSlot("footer", html`<span>📅 Última actualización: hoy</span>`);
    return card;
  }

  const tabButtons = tabs.map((t, i) =>
    html`<button
      style=${() => `padding:5px 12px;font-size:12px;border-radius:4px;cursor:pointer;
        background:${activeTab.value === i ? "#3b82f6" : "#1e293b"};
        color:${activeTab.value === i ? "#fff" : "#94a3b8"};border:none`}
      @click=${() => { activeTab.value = i; }}
    >${t.label}</button>`
  );

  mount(html`
    <div style="display:flex;flex-direction:column;gap:14px">
      <div style="display:flex;gap:8px">${tabButtons}</div>
      ${() => renderDemo()}
    </div>
  `, demoEl);
}

// ══════════════════════════════════════════════════════════════
//  FASE 16: show / hide directive
// ══════════════════════════════════════════════════════════════

import { showWhen } from "./nix";

{
  // ─── Helpers ──────────────────────────────────────────────────────────────
  let passed16 = 0, failed16 = 0;
  function assert16(cond: boolean, label: string) {
    if (cond) {
      passed16++;
      console.log(`  ✅ ${label}`);
    } else {
      failed16++;
      console.error(`  ❌ FAIL: ${label}`);
    }
  }

  console.group("Fase 16 — show / hide directive");

  // ─── show attribute ───────────────────────────────────────────────────────
  const vis = signal(true);

  // Test container
  const host = document.createElement("div");
  document.body.appendChild(host);

  mount(html`
    <span id="t16-show" show=${() => vis.value}>A</span>
    <span id="t16-hide" hide=${() => vis.value}>B</span>
  `, host);

  const elShow = host.querySelector<HTMLElement>("#t16-show")!;
  const elHide = host.querySelector<HTMLElement>("#t16-hide")!;

  assert16(elShow.style.display !== "none", "show=true → element visible");
  assert16(elHide.style.display === "none", "hide=true → element hidden");

  vis.value = false;
  assert16(elShow.style.display === "none", "show=false → element hidden");
  assert16(elHide.style.display !== "none", "hide=false → element visible");

  vis.value = true;
  assert16(elShow.style.display !== "none", "show restored to true → visible again");
  assert16(elHide.style.display === "none", "hide restored to true → hidden again");

  // Static value (non-function)
  const host2 = document.createElement("div");
  document.body.appendChild(host2);
  mount(html`
    <span id="t16-static-show" show=${false}>C</span>
    <span id="t16-static-hide" hide=${false}>D</span>
  `, host2);
  assert16(host2.querySelector<HTMLElement>("#t16-static-show")!.style.display === "none", "static show=false → hidden");
  assert16(host2.querySelector<HTMLElement>("#t16-static-hide")!.style.display !== "none", "static hide=false → visible");

  // DOM content is preserved (not unmounted)
  const counter = signal(0);
  const host3 = document.createElement("div");
  document.body.appendChild(host3);
  mount(html`<span id="t16-dom" show=${() => vis.value}>${() => counter.value}</span>`, host3);
  counter.value = 42;
  vis.value = false;
  vis.value = true;
  assert16(host3.querySelector<HTMLElement>("#t16-dom")!.textContent === "42", "DOM content preserved while hidden");

  // showWhen imperativo
  const imperativeEl = document.createElement("div");
  showWhen(imperativeEl, false);
  assert16(imperativeEl.style.display === "none", "showWhen(el, false) → display none");
  showWhen(imperativeEl, true);
  assert16(imperativeEl.style.display !== "none", "showWhen(el, true) → display restored");

  // Clean up test containers so they don't leak stray text into the page
  host.remove();
  host2.remove();
  host3.remove();

  console.groupEnd();

  // ─── Summary ──────────────────────────────────────────────────────────────
  const tests16El = document.getElementById("tests16");
  const summary16El = document.getElementById("summary16");

  if (tests16El) {
    const items = [`show reactive toggle`, `hide reactive toggle`, `show restored`, `hide restored`, `static show=false`, `static hide=false`, `DOM preserved`, `showWhen false`, `showWhen true`];
    tests16El.innerHTML = items.map((label, i) => {
      const ok = i < passed16;
      return `<div style="padding:4px 8px;border-left:3px solid ${ok ? "#22c55e" : "#ef4444"};margin:3px 0;font-size:13px">${ok ? "✅" : "❌"} ${label}</div>`;
    }).join("");
  }

  if (summary16El) {
    const total = passed16 + failed16;
    summary16El.innerHTML = `<p style="font-weight:600;color:${failed16 === 0 ? "#22c55e" : "#ef4444"}">${passed16}/${total} tests pasados</p>`;
  }

  // ─── Demo ─────────────────────────────────────────────────────────────────
  const demo16El = document.getElementById("demo16");
  if (demo16El) {
    const visible = signal(true);
    const loading = signal(false);
    const count = signal(0);

    mount(html`
      <div style="display:flex;flex-direction:column;gap:12px">

        <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <button
            style="padding:6px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer"
            @click=${() => { visible.value = !visible.value; }}
          >${() => visible.value ? "Ocultar panel" : "Mostrar panel"}</button>

          <button
            style="padding:6px 14px;background:#8b5cf6;color:#fff;border:none;border-radius:6px;cursor:pointer"
            @click=${() => { loading.value = !loading.value; }}
          >${() => loading.value ? "Quitar loading" : "Simular loading"}</button>

          <button
            style="padding:6px 14px;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer"
            @click=${() => { count.value++; }}
          >Incrementar (${() => count.value})</button>
        </div>

        <!-- show: visible cuando la señal es true -->
        <div
          show=${() => visible.value}
          style="padding:16px;background:#1e293b;border-radius:8px;border:1px solid #334155"
        >
          <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">
            Este panel usa <code>show</code> — el DOM se mantiene aunque esté oculto.
          </p>
          <p style="margin:0;font-size:24px;font-weight:700;color:#f1f5f9">
            Contador: ${() => count.value}
          </p>
        </div>

        <!-- hide: oculto cuando loading es true, visible cuando es false -->
        <div
          hide=${() => loading.value}
          style="padding:12px 16px;background:#0f172a;border-radius:8px;border:1px solid #1e293b;color:#94a3b8;font-size:13px"
        >
          Contenido normal (oculto mientras carga)
        </div>

        <!-- loading spinner usando hide inverso -->
        <div
          show=${() => loading.value}
          style="padding:12px 16px;background:#1e293b;border-radius:8px;border:1px solid #334155;color:#60a5fa;font-size:13px"
        >
          ⏳ Cargando...
        </div>

      </div>
    `, demo16El);
  }
}

// ══════════════════════════════════════════════════════════════
//  FASE 17: Portal
// ══════════════════════════════════════════════════════════════

import { portal } from "./nix";

{
  let passed17 = 0, failed17 = 0;
  function assert17(cond: boolean, label: string) {
    if (cond) { passed17++; console.log(`  ✅ ${label}`); }
    else { failed17++; console.error(`  ❌ FAIL: ${label}`); }
  }

  console.group("Fase 17 — Portal");

  // ─── portal() renders into target, NOT into tree position ───────────────
  const target = document.createElement("div");
  target.id = "portal-target-17";
  document.body.appendChild(target);

  const host17 = document.createElement("div");
  host17.id = "portal-host-17";
  document.body.appendChild(host17);

  // Mount a template that uses portal() — the portal content should appear in
  // `target`, not inside `host17`
  const handle17 = mount(
    html`
      <div id="host-inner">host content</div>
      ${portal(html`<span id="portal-content">portal content</span>`, target)}
    `,
    host17
  );

  assert17(
    host17.querySelector("#portal-content") === null,
    "portal content is NOT in the host tree"
  );
  assert17(
    target.querySelector("#portal-content") !== null,
    "portal content IS in the target element"
  );
  assert17(
    host17.querySelector("#host-inner") !== null,
    "non-portal content remains in the host"
  );
  assert17(
    target.querySelector("#portal-content")!.textContent === "portal content",
    "portal content has correct text"
  );

  // ─── Reactive portal: mounted when signal is true, unmounted when false ───
  const showPortal = signal(true);
  const target2 = document.createElement("div");
  document.body.appendChild(target2);

  mount(
    html`${() => showPortal.value
      ? portal(html`<span id="reactive-portal">reactive</span>`, target2)
      : null
      }`,
    document.createElement("div") // throwaway host (not attached — portals bypass it)
  );

  // Portal is mounted into target2 even when host is detached
  assert17(
    target2.querySelector("#reactive-portal") !== null,
    "reactive portal renders into target when condition is true"
  );

  showPortal.value = false;
  assert17(
    target2.querySelector("#reactive-portal") === null,
    "reactive portal is removed from target when condition becomes false"
  );

  showPortal.value = true;
  assert17(
    target2.querySelector("#reactive-portal") !== null,
    "reactive portal re-mounts when condition becomes true again"
  );

  // ─── CSS selector string as target ────────────────────────────────────
  const target3 = document.createElement("div");
  target3.id = "portal-selector-target";
  document.body.appendChild(target3);

  mount(
    html`${portal(html`<b id="selector-content">via selector</b>`, "#portal-selector-target")}`,
    document.createElement("div")
  );

  assert17(
    document.querySelector("#portal-selector-target #selector-content") !== null,
    "portal() accepts a CSS selector string as target"
  );

  // ─── unmount() cleans up portal content ─────────────────────────────
  const target4 = document.createElement("div");
  document.body.appendChild(target4);
  const handle4 = portal(
    html`<span id="cleanup-portal">cleanup</span>`,
    target4
  ).mount(document.createElement("div"));

  assert17(
    target4.querySelector("#cleanup-portal") !== null,
    "portal mounts content via .mount()"
  );

  handle4.unmount();
  assert17(
    target4.querySelector("#cleanup-portal") === null,
    "portal content removed after unmount()"
  );

  // Clean up test nodes
  handle17.unmount();
  host17.remove();
  target.remove();
  target2.remove();
  target3.remove();
  target4.remove();

  console.groupEnd();

  // ─── Summary ──────────────────────────────────────────────────────────────────
  const tests17El = document.getElementById("tests17");
  const summary17El = document.getElementById("summary17");

  if (tests17El) {
    const labels = [
      "content NOT in host tree",
      "content IS in target",
      "host content stays in host",
      "portal text correct",
      "reactive: mounts when true",
      "reactive: unmounts when false",
      "reactive: re-mounts when true",
      "CSS selector as target",
      ".mount() works",
      "unmount() cleans up",
    ];
    tests17El.innerHTML = labels.map((l, i) => {
      const ok = i < passed17;
      return `<div style="padding:4px 8px;border-left:3px solid ${ok ? "#22c55e" : "#ef4444"};margin:3px 0;font-size:13px">${ok ? "✅" : "❌"} ${l}</div>`;
    }).join("");
  }
  if (summary17El) {
    const total = passed17 + failed17;
    summary17El.innerHTML = `<p style="font-weight:600;color:${failed17 === 0 ? "#22c55e" : "#ef4444"}">${passed17}/${total} tests pasados</p>`;
  }

  // ─── Demo ──────────────────────────────────────────────────────────────────
  const demo17El = document.getElementById("demo17");
  if (demo17El) {
    const showModal = signal(false);
    const showToast = signal(false);
    const toastMsg = signal("");
    let toastTimer: ReturnType<typeof setTimeout>;

    function triggerToast(msg: string) {
      toastMsg.value = msg;
      showToast.value = true;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => { showToast.value = false; }, 2500);
    }

    // The portal overlay/modal renders into document.body at top level,
    // so z-index, overflow, and stacking contexts can't clip it.
    mount(html`
      <div style="display:flex;flex-direction:column;gap:12px">

        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button
            style="padding:6px 14px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer"
            @click=${() => { showModal.value = true; }}
          >Abrir Modal</button>

          <button
            style="padding:6px 14px;background:#10b981;color:#fff;border:none;border-radius:6px;cursor:pointer"
            @click=${() => triggerToast("Cambios guardados con éxito ✨")}
          >Toast éxito</button>

          <button
            style="padding:6px 14px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer"
            @click=${() => triggerToast("❌ Error al conectar con el servidor")}
          >Toast error</button>
        </div>

        <p style="font-size:12px;color:#64748b;margin:0">
          El modal y los toasts se renderizan en <code>document.body</code> mediante <code>portal()</code>.
          No pueden ser recortados por ningún contenedor con <code>overflow:hidden</code>.
        </p>

        <!-- Modal portal: renders into document.body -->
        ${() => showModal.value ? portal(html`
          <div
            id="demo17-overlay"
            @click=${() => { showModal.value = false; }}
            style="
              position:fixed;inset:0;background:rgba(0,0,0,.65);
              display:flex;align-items:center;justify-content:center;
              z-index:9999
            "
          >
            <div
              @click.stop=${() => { }}
              style="
                background:#1e293b;border:1px solid #334155;border-radius:12px;
                padding:28px 32px;min-width:320px;max-width:480px;
                box-shadow:0 25px 50px rgba(0,0,0,.5)
              "
            >
              <h2 style="margin:0 0 12px;color:#f1f5f9;font-size:20px">❄️ Portal Modal</h2>
              <p style="margin:0 0 20px;color:#94a3b8;font-size:14px;line-height:1.6">
                Este cuadro de diálogo vive en <code>document.body</code>, no dentro
                del árbol del componente. Nunca será recortado por ningún contenedor.
              </p>
              <div style="display:flex;justify-content:flex-end">
                <button
                  @click=${() => { showModal.value = false; }}
                  style="padding:8px 18px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer"
                >Cerrar</button>
              </div>
            </div>
          </div>
        `) : null}

        <!-- Toast portal: renders into document.body -->
        ${() => showToast.value ? portal(html`
          <div
            style="
              position:fixed;bottom:24px;right:24px;
              background:#1e293b;border:1px solid #334155;
              border-radius:8px;padding:12px 18px;
              color:#f1f5f9;font-size:14px;
              box-shadow:0 8px 24px rgba(0,0,0,.4);
              z-index:9999;max-width:320px
            "
          >${() => toastMsg.value}</div>
        `) : null}

      </div>
    `, demo17El);
  }
}

// ══════════════════════════════════════════════════════════════
//  FASE 17b: Portal Ergonomics
//  Option A: createPortalOutlet + portalOutlet
//  Option B: portal() con NixRef
//  Option C: provideOutlet + injectOutlet
//  Tests → #tests17b | Summary → #summary17b | Demo → #demo17b
// ══════════════════════════════════════════════════════════════
import { createPortalOutlet, portalOutlet, provideOutlet, injectOutlet } from "./nix";
import type { PortalOutlet } from "./nix";

{
  let passed17b = 0, failed17b = 0;
  const labels17b: string[] = [];
  function assert17b(cond: boolean, label: string) {
    labels17b.push(label);
    if (cond) { passed17b++; console.log(`  ✅ ${label}`); }
    else { failed17b++; console.error(`  ❌ FAIL: ${label}`); }
  }

  console.group("Fase 17b — Portal Ergonomics");

  // ─── Option A: createPortalOutlet + portalOutlet ───────────────────────────

  // Test 1: token shape
  const outletA = createPortalOutlet();
  assert17b(outletA.__isPortalOutlet === true, "A — createPortalOutlet() devuelve token con __isPortalOutlet");
  assert17b(outletA._container === null, "A — _container es null antes de montar");

  // Test 2: portalOutlet() creates the anchor div
  const hostA = document.createElement("div");
  document.body.appendChild(hostA);
  portalOutlet(outletA).mount(hostA);
  assert17b(hostA.querySelector("[data-nix-outlet]") !== null, "A — portalOutlet() crea div[data-nix-outlet] en el host");
  assert17b(outletA._container !== null, "A — _container queda asignado tras montar el outlet");

  // Test 3: portal(content, outlet) renders into the outlet div
  mount(html`${portal(html`<span id="acc-outlet-content">en outlet</span>`, outletA)}`, document.createElement("div"));
  assert17b(
    outletA._container!.querySelector("#acc-outlet-content") !== null,
    "A — portal(content, outlet) renderiza dentro del outlet container"
  );
  assert17b(
    hostA.querySelector("#acc-outlet-content") !== null,
    "A — contenido del portal es accesible desde el host (via outlet div)"
  );

  // Test 4: unmount clears _container
  const outletClean = createPortalOutlet();
  const hostClean = document.createElement("div");
  document.body.appendChild(hostClean);
  const handleClean = portalOutlet(outletClean).mount(hostClean);
  handleClean.unmount();
  assert17b(outletClean._container === null, "A — _container vuelve a null tras unmount del outlet");

  hostA.remove();
  hostClean.remove();

  // ─── Option B: portal() con NixRef ────────────────────────────────────────

  // Test 5: portal renders into ref.el
  const refTarget = ref<HTMLElement>();
  const hostRef = document.createElement("div");
  document.body.appendChild(hostRef);
  mount(html`<div ref=${refTarget} id="ref-target-b"></div>`, hostRef);
  // ref.el is now populated

  const hostRef2 = document.createElement("div");
  document.body.appendChild(hostRef2);
  mount(html`${portal(html`<span id="ref-portal-content">via ref</span>`, refTarget)}`, hostRef2);
  assert17b(
    refTarget.el!.querySelector("#ref-portal-content") !== null,
    "B — portal(content, ref) renderiza dentro de ref.el"
  );
  assert17b(
    hostRef2.querySelector("#ref-portal-content") === null,
    "B — portal(content, ref) NO aparece en el árbol del host"
  );

  hostRef.remove();
  hostRef2.remove();

  // ─── Option C: provideOutlet + injectOutlet ────────────────────────────────

  let injectedOutlet: PortalOutlet | undefined;
  const outletC = createPortalOutlet();

  class ProviderC extends NixComponent {
    onInit() { provideOutlet(outletC); }
    render() { return html`<div>${new ConsumerC()}</div>`; }
  }
  class ConsumerC extends NixComponent {
    onInit() { injectedOutlet = injectOutlet(); }
    render() { return html`<span></span>`; }
  }

  const hostC = document.createElement("div");
  document.body.appendChild(hostC);
  mount(html`${new ProviderC()}`, hostC);
  assert17b(injectedOutlet === outletC, "C — injectOutlet() devuelve el outlet provisto por el ancestro");

  hostC.remove();

  console.groupEnd();

  // ─── Summary ──────────────────────────────────────────────────────────────
  const tests17bEl = document.getElementById("tests17b");
  const summary17bEl = document.getElementById("summary17b");

  if (tests17bEl) {
    tests17bEl.innerHTML = labels17b.map((l, i) => {
      const ok = i < passed17b;
      return `<div style="padding:4px 8px;border-left:3px solid ${ok ? "#22c55e" : "#ef4444"};margin:3px 0;font-size:13px">${ok ? "✅" : "❌"} ${l}</div>`;
    }).join("");
  }
  if (summary17bEl) {
    const total = passed17b + failed17b;
    summary17bEl.innerHTML = `<p style="font-weight:600;color:${failed17b === 0 ? "#22c55e" : "#ef4444"}">${passed17b}/${total} tests pasados</p>`;
  }

  // ─── Demo ─────────────────────────────────────────────────────────────────
  const demo17bEl = document.getElementById("demo17b");
  if (demo17bEl) {
    // AppLayout provides a PortalOutlet; ModalButton injects it.
    // No CSS selectors. No direct DOM references. No prop drilling.
    const mainOutlet = createPortalOutlet();

    class AppLayout extends NixComponent {
      private inner: NixTemplate;
      constructor(inner: NixTemplate) { super(); this.inner = inner; }
      onInit() { provideOutlet(mainOutlet); }
      render() {
        return html`
          <div style="border:1px solid #334155;border-radius:8px;padding:16px;overflow:hidden;position:relative">
            <p style="font-size:11px;color:#64748b;margin:0 0 10px">
              📦 <strong>AppLayout</strong> — <code>overflow:hidden</code> · el modal escapa gracias al portal
            </p>
            ${this.inner}
            ${portalOutlet(mainOutlet)}
          </div>
        `;
      }
    }

    class ModalButton extends NixComponent {
      private outlet: PortalOutlet | undefined;
      private open = signal(false);
      onInit() { this.outlet = injectOutlet(); }
      render() {
        return html`
          <div style="display:flex;flex-direction:column;gap:10px">
            <button
              style="padding:6px 14px;background:#8b5cf6;color:#fff;border:none;border-radius:6px;cursor:pointer;align-self:flex-start"
              @click=${() => { this.open.value = true; }}
            >Abrir Modal (via injectOutlet)</button>

            ${() => this.open.value ? portal(html`
              <div
                style="
                  position:fixed;inset:0;background:rgba(0,0,0,.6);
                  display:flex;align-items:center;justify-content:center;z-index:9999
                "
                @click=${() => { this.open.value = false; }}
              >
                <div
                  style="background:#1e293b;border:1px solid #334155;border-radius:12px;
                         padding:28px 32px;max-width:400px"
                  @click.stop=${() => { }}
                >
                  <h3 style="margin:0 0 10px;color:#f1f5f9">Modal via injectOutlet()</h3>
                  <p style="color:#94a3b8;font-size:14px;margin:0 0 18px;line-height:1.6">
                    Renderizado en el outlet inyectado.<br>
                    Sin prop drilling · Sin selectores CSS · Sin DOM manual.
                  </p>
                  <button
                    style="padding:7px 16px;background:#8b5cf6;color:#fff;border:none;border-radius:6px;cursor:pointer"
                    @click=${() => { this.open.value = false; }}
                  >Cerrar</button>
                </div>
              </div>
            `, this.outlet ?? document.body) : null}
          </div>
        `;
      }
    }

    mount(
      new AppLayout(
        html`${new ModalButton()}`
      ).render(),
      demo17bEl
    );
  }
}

// ══════════════════════════════════════════════════════════════
//  FASE 18: Error Boundaries
//  Tests → #tests18 | Summary → #summary18 | Demo → #demo18
// ══════════════════════════════════════════════════════════════
import { createErrorBoundary } from "./nix";

// CANARY — does Phase 18 code execute at all?
document.getElementById("tests18")!.textContent = "CANARY: Phase 18 code started";

{
  let passed18 = 0, failed18 = 0;
  const labels18: string[] = [];
  function assert18(cond: boolean, label: string) {
    labels18.push(label);
    if (cond) { passed18++; console.log(`  ✅ ${label}`); }
    else { failed18++; console.error(`  ❌ FAIL: ${label}`); }
  }

  console.group("Fase 18 — Error Boundaries");

  // ─── Test 1: renders content when no error ────────────────────────────────
  const host1 = document.createElement("div");
  document.body.appendChild(host1);
  createErrorBoundary(
    html`<span id="eb-ok">content</span>`,
    html`<span id="eb-fb1">fallback</span>`
  ).mount(host1);
  assert18(host1.querySelector("#eb-ok") !== null, "no error → content rendered");
  assert18(host1.querySelector("#eb-fb1") === null, "no error → fallback NOT rendered");
  host1.remove();

  // ─── Test 2: renders fallback when template throws on render ─────────────
  const host2 = document.createElement("div");
  document.body.appendChild(host2);
  createErrorBoundary(
    html`<span>${() => { throw new Error("render fail"); }}</span>`,
    html`<span id="eb-fb2">fallback</span>`
  ).mount(host2);
  assert18(host2.querySelector("#eb-fb2") !== null, "render throw → fallback shown");
  host2.remove();

  // ─── Test 3: fallback receives the error ──────────────────────────────────
  const host3 = document.createElement("div");
  document.body.appendChild(host3);
  const caughtErr = signal<unknown>(null);
  createErrorBoundary(
    html`${() => { throw new TypeError("typed error"); }}`,
    (err) => { caughtErr.value = err; return html`<span id="eb-fb3">err</span>`; }
  ).mount(host3);
  assert18(caughtErr.value instanceof TypeError, "fallback fn receives the error object");
  assert18((caughtErr.value as Error).message === "typed error", "fallback fn: correct error message");
  host3.remove();

  // ─── Test 4: NixComponent — onInit throws ─────────────────────────────────
  class BrokenInit extends NixComponent {
    onInit() { throw new Error("init fail"); }
    render() { return html`<span id="eb-broken-init">never</span>`; }
  }
  const host4 = document.createElement("div");
  document.body.appendChild(host4);
  createErrorBoundary(new BrokenInit(), html`<span id="eb-fb4">caught init</span>`).mount(host4);
  assert18(host4.querySelector("#eb-broken-init") === null, "onInit throw → content NOT rendered");
  assert18(host4.querySelector("#eb-fb4") !== null, "onInit throw → fallback shown");
  host4.remove();

  // ─── Test 5: NixComponent — render() throws ──────────────────────────────
  class BrokenRender extends NixComponent {
    render() { throw new Error("render method fail"); return html``; }
  }
  const host5 = document.createElement("div");
  document.body.appendChild(host5);
  createErrorBoundary(new BrokenRender(), html`<span id="eb-fb5">caught render</span>`).mount(host5);
  assert18(host5.querySelector("#eb-fb5") !== null, "render() throw → fallback shown");
  host5.remove();

  // ─── Test 6: reactive error triggers fallback ─────────────────────────────
  const boom = signal(false);
  const host6 = document.createElement("div");
  document.body.appendChild(host6);
  createErrorBoundary(
    html`<span id="eb-reactive">${() => {
      if (boom.value) throw new Error("reactive fail");
      return "ok";
    }}</span>`,
    html`<span id="eb-fb6">reactive fallback</span>`
  ).mount(host6);
  assert18(host6.querySelector("#eb-reactive") !== null, "reactive: content visible before error");
  assert18(host6.querySelector("#eb-fb6") === null, "reactive: fallback hidden before error");
  boom.value = true;
  assert18(host6.querySelector("#eb-reactive") === null, "reactive throw → content removed");
  assert18(host6.querySelector("#eb-fb6") !== null, "reactive throw → fallback shown");
  host6.remove();

  // ─── Test 7: unmount cleans up boundary ──────────────────────────────────
  const host7 = document.createElement("div");
  document.body.appendChild(host7);
  const handle7 = createErrorBoundary(
    html`<span id="eb-unmount">unmount test</span>`,
    html`<span>fb</span>`
  ).mount(host7);
  assert18(host7.querySelector("#eb-unmount") !== null, "before unmount: content present");
  handle7.unmount();
  assert18(host7.querySelector("#eb-unmount") === null, "after unmount: content removed");
  host7.remove();

  // ─── Test 8: nested boundaries — inner catches first ─────────────────────
  const host8 = document.createElement("div");
  document.body.appendChild(host8);
  const innerErr = signal(false);
  createErrorBoundary(
    html`
      <span id="eb-outer-ok">outer content</span>
      ${createErrorBoundary(
      html`<span>${() => { if (innerErr.value) throw new Error("inner"); return "inner ok"; }}</span>`,
      html`<span id="eb-inner-fb">inner fallback</span>`
    )}
    `,
    html`<span id="eb-outer-fb">outer fallback</span>`
  ).mount(host8);
  assert18(host8.querySelector("#eb-outer-ok") !== null, "nested: outer content visible");
  assert18(host8.querySelector("#eb-inner-fb") === null, "nested: inner fallback hidden initially");
  innerErr.value = true;
  assert18(host8.querySelector("#eb-inner-fb") !== null, "nested: inner boundary caught the error");
  assert18(host8.querySelector("#eb-outer-fb") === null, "nested: outer boundary NOT triggered");
  assert18(host8.querySelector("#eb-outer-ok") !== null, "nested: outer content unaffected");
  host8.remove();

  console.groupEnd();

  // ─── Summary ──────────────────────────────────────────────────────────────
  const tests18El = document.getElementById("tests18");
  const summary18El = document.getElementById("summary18");

  if (tests18El) {
    tests18El.innerHTML = labels18.map((l, i) => {
      const ok = i < passed18;
      return `<div style="padding:4px 8px;border-left:3px solid ${ok ? "#22c55e" : "#ef4444"};margin:3px 0;font-size:13px">${ok ? "✅" : "❌"} ${l}</div>`;
    }).join("");
  }
  if (summary18El) {
    const total = passed18 + failed18;
    summary18El.innerHTML = `<p style="font-weight:600;color:${failed18 === 0 ? "#22c55e" : "#ef4444"}">${passed18}/${total} tests pasados</p>`;
  }

  // ─── Demo ─────────────────────────────────────────────────────────────────
  const demo18El = document.getElementById("demo18");
  if (demo18El) {
    // Simulates a widget that can fail on demand
    const shouldFail = signal(false);
    const failMsg = signal("Something went wrong");
    const resetKey = signal(0); // bump to re-mount content

    class DataWidget extends NixComponent {
      private data = signal(["Alice", "Bob", "Carol"]);
      render() {
        return html`
          <div style="display:flex;flex-direction:column;gap:8px">
            <p style="font-size:13px;color:#94a3b8;margin:0">
              Widget interno — puede fallar por señal reactiva:
            </p>
            <ul style="margin:0;padding:0 0 0 18px">
              ${() => {
            if (shouldFail.value) throw new Error(failMsg.value);
            return this.data.value.map(name => html`<li style="color:#e2e8f0;font-size:14px">${name}</li>`);
          }}
            </ul>
          </div>
        `;
      }
    }

    mount(html`
      <div style="display:flex;flex-direction:column;gap:14px">

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button
            style="padding:6px 14px;background:#ef4444;color:#fff;border:none;border-radius:6px;cursor:pointer"
            @click=${() => { shouldFail.value = true; }}
          >💥 Tirar error</button>
          <button
            style="padding:6px 14px;background:#22c55e;color:#fff;border:none;border-radius:6px;cursor:pointer"
            @click=${() => { shouldFail.value = false; resetKey.value++; }}
          >🔄 Recuperar</button>
          <input
            type="text"
            placeholder="Mensaje de error..."
            style="padding:6px 10px;background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-radius:6px;font-size:13px"
            value="Something went wrong"
            @input=${(e: Event) => { failMsg.value = (e.target as HTMLInputElement).value; }}
          />
        </div>

        <!-- The boundary key-resets by conditionally swapping based on resetKey -->
        ${() => {
        const _key = resetKey.value; // dependency: re-creates boundary on Recuperar
        void _key;
        return createErrorBoundary(
          new DataWidget(),
          (err) => html`
            <div style="padding:14px;border-radius:8px;border:1px solid #7f1d1d;background:#450a0a;color:#fca5a5">
              <strong style="display:block;margin-bottom:6px">❌ Error Boundary capturó un fallo</strong>
              <code style="font-size:12px;color:#f87171">${String(err)}</code>
              <p style="font-size:12px;color:#fca5a5;margin:8px 0 0">
                Pulsa <strong>Recuperar</strong> para reiniciar el widget.
              </p>
            </div>
          `
        );
      }}

        <p style="font-size:12px;color:#64748b;margin:0">
          El error boundary aísla el fallo. El botón "Recuperar" limpia la señal de error
          y el boundary vuelve a renderizar el contenido original.
        </p>
      </div>
    `, demo18El);
  }
}

// ══════════════════════════════════════════════════════════════
//  FASE 19: Transitions / Animations
//  Tests → #tests19 | Summary → #summary19 | Demo → #demo19
// ══════════════════════════════════════════════════════════════
import { transition } from "./nix";

{
  let passed19 = 0, failed19 = 0;
  const labels19: string[] = [];
  const results19: boolean[] = [];
  function assert19(cond: boolean, label: string) {
    labels19.push(label);
    results19.push(cond);
    if (cond) { passed19++; console.log(`  ✅ ${label}`); }
    else { failed19++; console.error(`  ❌ FAIL: ${label}`); }
  }

  console.group("Fase 19 — Transitions");

  // ─── Test 1: static content renders in DOM (no appear) ────────────────────
  {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const handle = transition(
      html`<p class="t19-static">Static</p>`,
      { name: "fade" }
    ).mount(host);
    const rendered = host.querySelector(".t19-static");
    assert19(rendered !== null, "T1 — static content rendered in DOM");
    // No enter classes without appear
    assert19(
      !rendered?.classList.contains("fade-enter-from"),
      "T1 — no enter-from class without appear"
    );
    handle.unmount();
    assert19(host.querySelector(".t19-static") === null, "T1 — cleanup removes DOM");
  }

  // ─── Test 2: static content with appear adds enter classes ────────────────
  {
    const host = document.createElement("div");
    document.body.appendChild(host);
    transition(
      html`<span class="t19-appear">Appear</span>`,
      { name: "fade", appear: true }
    ).mount(host);
    const el = host.querySelector(".t19-appear");
    // Classes are added synchronously before rAF
    assert19(
      el?.classList.contains("fade-enter-from") ?? false,
      "T2 — enter-from class present immediately after mount (appear:true)"
    );
    assert19(
      el?.classList.contains("fade-enter-active") ?? false,
      "T2 — enter-active class present immediately after mount (appear:true)"
    );
    host.remove();
  }

  // ─── Test 3: reactive null→value triggers enter ───────────────────────────
  {
    const show = signal(false);
    const host = document.createElement("div");
    document.body.appendChild(host);
    transition(
      () => show.value ? html`<div class="t19-cond">Cond</div>` : null,
      { name: "slide" }
    ).mount(host);
    assert19(host.querySelector(".t19-cond") === null, "T3 — null start: nothing rendered");
    show.value = true;
    assert19(host.querySelector(".t19-cond") !== null, "T3 — content appears when show=true");
    assert19(
      host.querySelector(".t19-cond")?.classList.contains("slide-enter-from") ?? false,
      "T3 — slide-enter-from added on first enter"
    );
    host.remove();
  }

  // ─── Test 4: reactive value→null triggers leave (element still in DOM) ────
  {
    const show = signal(true);
    const host = document.createElement("div");
    document.body.appendChild(host);
    transition(
      () => show.value ? html`<div class="t19-leave">Leave</div>` : null,
      { name: "fade" }
    ).mount(host);
    // Initially visible
    assert19(host.querySelector(".t19-leave") !== null, "T4 — content starts visible");
    show.value = false;
    // During leave transition, element still in DOM with leave classes
    assert19(host.querySelector(".t19-leave") !== null, "T4 — element stays in DOM during leave");
    assert19(
      host.querySelector(".t19-leave")?.classList.contains("fade-leave-from") ?? false,
      "T4 — fade-leave-from added when leaving"
    );
    host.remove();
  }

  // ─── Test 5: JS hooks onBeforeEnter / onAfterEnter fire ───────────────────
  {
    let beforeFired = false;
    const host = document.createElement("div");
    document.body.appendChild(host);
    transition(
      html`<div class="t19-hooks">Hooks</div>`,
      {
        name: "x",
        appear: true,
        onBeforeEnter: () => { beforeFired = true; },
        onAfterEnter: () => { /* async — tested via duration */ },
      }
    ).mount(host);
    assert19(beforeFired, "T5 — onBeforeEnter called synchronously");
    host.remove();
  }

  // ─── Test 6: JS hooks onBeforeLeave fires ────────────────────────────────
  {
    let leaveFired = false;
    const show = signal(true);
    const host = document.createElement("div");
    document.body.appendChild(host);
    transition(
      () => show.value ? html`<div class="t19-hooks-leave">L</div>` : null,
      { name: "x", onBeforeLeave: () => { leaveFired = true; } }
    ).mount(host);
    show.value = false;
    assert19(leaveFired, "T6 — onBeforeLeave called when leaving");
    host.remove();
  }

  // ─── Test 7: custom class name overrides ─────────────────────────────────
  {
    const host = document.createElement("div");
    document.body.appendChild(host);
    transition(
      html`<em class="t19-custom">Custom</em>`,
      { appear: true, enterFrom: "my-from", enterActive: "my-active", enterTo: "my-to" }
    ).mount(host);
    const el = host.querySelector(".t19-custom");
    assert19(el?.classList.contains("my-from") ?? false, "T7 — custom enterFrom class used");
    assert19(el?.classList.contains("my-active") ?? false, "T7 — custom enterActive class used");
    host.remove();
  }

  // ─── Test 8: leave cancelled by re-enter (instant swap) ──────────────────
  {
    const show = signal(true);
    const host = document.createElement("div");
    document.body.appendChild(host);
    transition(
      () => show.value ? html`<div class="t19-cancel">Show</div>` : null,
      { name: "fade" }
    ).mount(host);
    show.value = false; // starts leave
    show.value = true;  // immediately cancelled — re-enter
    // After re-enter, content is visible again
    assert19(host.querySelector(".t19-cancel") !== null, "T8 — re-enter after leave cancel keeps content in DOM");
    host.remove();
  }

  // ─── Test 9: unmount cleans up transition content from DOM ───────────────
  {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const handle = transition(
      html`<p class="t19-unmount">Unmount</p>`,
      { name: "f" }
    ).mount(host);
    assert19(host.querySelector(".t19-unmount") !== null, "T9 — content present before unmount");
    handle.unmount();
    assert19(host.querySelector(".t19-unmount") === null, "T9 — content removed after unmount");
    host.remove();
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  console.groupEnd();

  const tests19El = document.getElementById("tests19");
  const summary19El = document.getElementById("summary19");

  if (tests19El) {
    tests19El.innerHTML = labels19.map((l, i) => {
      const ok = results19[i];
      return `<div style="padding:4px 8px;border-left:3px solid ${ok ? "#22c55e" : "#ef4444"};margin:3px 0;font-size:13px">${ok ? "✅" : "❌"} ${l}</div>`;
    }).join("");
  }
  if (summary19El) {
    const total = passed19 + failed19;
    summary19El.innerHTML = `<p style="font-weight:600;color:${failed19 === 0 ? "#22c55e" : "#ef4444"}">${passed19}/${total} tests pasados</p>`;
  }

  // ─── Demo ────────────────────────────────────────────────────────────────
  const demo19El = document.querySelector("#demo19");
  if (demo19El) {
    const showFade = signal(true);
    const showSlide = signal(false);
    const showZoom = signal(false);

    const card = (label: string, color: string) =>
      html`<div style="${`padding:16px 20px;border-radius:8px;border:1px solid ${color};background:${color}22;color:${color};font-size:13px;font-weight:600`}">${label}</div>`;

    html`
      <div style="display:flex;flex-direction:column;gap:20px">
        <style>
          /* ── Fade ────────────────────────────────── */
          .fade-enter-active, .fade-leave-active { transition: opacity 0.4s ease; }
          .fade-enter-from,   .fade-leave-to     { opacity: 0; }
          /* ── Slide Up ────────────────────────────── */
          .slide-up-enter-active, .slide-up-leave-active {
            transition: opacity 0.35s ease, transform 0.35s ease;
          }
          .slide-up-enter-from, .slide-up-leave-to {
            opacity: 0; transform: translateY(14px);
          }
          /* ── Zoom ────────────────────────────────── */
          .zoom-enter-active, .zoom-leave-active {
            transition: opacity 0.3s ease, transform 0.3s ease;
          }
          .zoom-enter-from, .zoom-leave-to {
            opacity: 0; transform: scale(0.85);
          }
        </style>

        <!-- Fade -->
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="font-size:12px;color:#94a3b8;font-weight:600">FADE</label>
          <button
            style="padding:6px 14px;background:#2563eb;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;width:fit-content"
            @click=${() => { showFade.value = !showFade.value; }}
          >${() => showFade.value ? "Ocultar" : "Mostrar"}</button>
          ${transition(() => showFade.value ? card("Fade — opacidad suave", "#3b82f6") : null, { name: "fade" })}
        </div>

        <!-- Slide Up -->
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="font-size:12px;color:#94a3b8;font-weight:600">SLIDE UP</label>
          <button
            style="padding:6px 14px;background:#7c3aed;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;width:fit-content"
            @click=${() => { showSlide.value = !showSlide.value; }}
          >${() => showSlide.value ? "Ocultar" : "Mostrar"}</button>
          ${transition(() => showSlide.value ? card("Slide Up — sube al aparecer", "#8b5cf6") : null, { name: "slide-up" })}
        </div>

        <!-- Zoom -->
        <div style="display:flex;flex-direction:column;gap:8px">
          <label style="font-size:12px;color:#94a3b8;font-weight:600">ZOOM</label>
          <button
            style="padding:6px 14px;background:#059669;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;width:fit-content"
            @click=${() => { showZoom.value = !showZoom.value; }}
          >${() => showZoom.value ? "Ocultar" : "Mostrar"}</button>
          ${transition(() => showZoom.value ? card("Zoom — escala al aparecer", "#10b981") : null, { name: "zoom" })}
        </div>

        <p style="font-size:11px;color:#475569;margin:0">
          Las clases CSS son las únicas que necesitas. <code>transition()</code>
          añade y quita las clases automáticamente en el momento correcto.
        </p>
      </div>
    `.mount(demo19El as Element);
  }
}

// ══════════════════════════════════════════════════════════════
//  FASE 20: Route Guards
//  Tests → #tests20 | Summary → #summary20 | Demo → #demo20
// ══════════════════════════════════════════════════════════════
import type { NavigationGuard } from "./nix";

{
  let passed20 = 0, failed20 = 0;
  const labels20: string[] = [];
  const results20: boolean[] = [];
  function assert20(cond: boolean, label: string) {
    labels20.push(label);
    results20.push(cond);
    if (cond) { passed20++; console.log(`  ✅ ${label}`); }
    else { failed20++; console.error(`  ❌ FAIL: ${label}`); }
  }

  console.group("Fase 20 — Route Guards");

  const makeRoutes = () => [
    { path: "/", component: () => html`<span>home</span>` },
    { path: "/about", component: () => html`<span>about</span>` },
    { path: "/admin", component: () => html`<span>admin</span>` },
  ];

  // ─── Test 1: beforeEach fires on navigate ─────────────────────────────────
  {
    const r = createRouter(makeRoutes());
    let fired = false;
    r.beforeEach(() => { fired = true; });
    r.navigate("/about");
    assert20(fired, "T1 — beforeEach fires on navigate");
  }

  // ─── Test 2: beforeEach returning false cancels navigation ────────────────
  {
    const r = createRouter(makeRoutes());
    const beforePath = r.current.value;
    r.beforeEach(() => false);
    r.navigate("/about");
    assert20(r.current.value === beforePath, "T2 — beforeEach false cancels navigation");
  }

  // ─── Test 3: beforeEach returning a string redirects ─────────────────────
  {
    const r = createRouter(makeRoutes());
    r.beforeEach((to) => {
      if (to === "/admin") return "/";
    });
    r.navigate("/admin");
    assert20(r.current.value === "/", "T3 — beforeEach redirect: /admin → /");
  }

  // ─── Test 4: beforeEach receives correct to/from arguments ───────────────
  {
    const r = createRouter(makeRoutes());
    let capturedTo = "", capturedFrom = "";
    r.beforeEach((to, from) => { capturedTo = to; capturedFrom = from; });
    r.navigate("/about");
    assert20(capturedTo === "/about" && capturedFrom === "/", "T4 — guard receives correct to/from");
  }

  // ─── Test 5: per-route beforeEnter fires only for that route ─────────────
  {
    let adminGuardFired = false;
    const routes = [
      { path: "/", component: () => html`<span>home</span>` },
      { path: "/about", component: () => html`<span>about</span>` },
      {
        path: "/admin", component: () => html`<span>admin</span>`,
        beforeEnter: (() => { adminGuardFired = true; }) as NavigationGuard
      },
    ];
    const r = createRouter(routes);
    r.navigate("/about");
    const notFiredYet = !adminGuardFired;
    r.navigate("/admin");
    assert20(notFiredYet && adminGuardFired, "T5 — beforeEnter fires only for /admin");
  }

  // ─── Test 6: per-route beforeEnter returning false blocks navigation ──────
  {
    const routes = [
      { path: "/", component: () => html`<span>home</span>` },
      {
        path: "/secret", component: () => html`<span>secret</span>`,
        beforeEnter: (() => false) as NavigationGuard
      },
    ];
    const r = createRouter(routes);
    const beforePath = r.current.value;
    r.navigate("/secret");
    assert20(r.current.value === beforePath, "T6 — beforeEnter false blocks /secret");
  }

  // ─── Test 7: multiple beforeEach guards run in registration order ─────────
  {
    const r = createRouter(makeRoutes());
    const order: number[] = [];
    r.beforeEach(() => { order.push(1); });
    r.beforeEach(() => { order.push(2); });
    r.beforeEach(() => { order.push(3); });
    r.navigate("/about");
    assert20(order[0] === 1 && order[1] === 2 && order[2] === 3, "T7 — guards run in order [1,2,3]");
  }

  // ─── Test 8: beforeEach unsubscribe removes the guard ────────────────────
  {
    const r = createRouter(makeRoutes());
    let count = 0;
    const stop = r.beforeEach(() => { count++; });
    r.navigate("/about");
    stop();
    r.navigate("/admin");
    assert20(count === 1, "T8 — unsubscribed guard does not fire after stop()");
  }

  // ─── Test 9: first guard returning false short-circuits remaining guards ──
  {
    const r = createRouter(makeRoutes());
    let secondFired = false;
    r.beforeEach(() => false);
    r.beforeEach(() => { secondFired = true; });
    r.navigate("/about");
    assert20(!secondFired, "T9 — second guard skipped when first returns false");
  }

  // ─── Summary ────────────────────────────────────────────────────────────
  console.groupEnd();

  const tests20El = document.getElementById("tests20");
  const summary20El = document.getElementById("summary20");

  if (tests20El) {
    tests20El.innerHTML = labels20.map((l, i) => {
      const ok = results20[i];
      return `<div style="padding:4px 8px;border-left:3px solid ${ok ? "#22c55e" : "#ef4444"};margin:3px 0;font-size:13px">${ok ? "✅" : "❌"} ${l}</div>`;
    }).join("");
  }
  if (summary20El) {
    const total = passed20 + failed20;
    summary20El.innerHTML = `<p style="font-weight:600;color:${failed20 === 0 ? "#22c55e" : "#ef4444"}">${passed20}/${total} tests pasados</p>`;
  }

  // ─── Demo ────────────────────────────────────────────────────────────────
  const demo20El = document.querySelector("#demo20");
  if (demo20El) {
    const isLoggedIn = signal(false);

    const demoRouter = createRouter([
      { path: "/", component: () => html`<div style="color:#e2e8f0"><h3 style="margin:0 0 6px">🏠 Inicio</h3><p style="color:#94a3b8;font-size:13px;margin:0">Página pública</p></div>` },
      { path: "/perfil", component: () => html`<div style="color:#e2e8f0"><h3 style="margin:0 0 6px">👤 Perfil</h3><p style="color:#94a3b8;font-size:13px;margin:0">Solo usuarios autenticados</p></div>` },
      { path: "/ajustes", component: () => html`<div style="color:#e2e8f0"><h3 style="margin:0 0 6px">⚙️ Ajustes</h3><p style="color:#94a3b8;font-size:13px;margin:0">Solo usuarios autenticados</p></div>` },
      { path: "/login", component: () => html`<div style="color:#fbbf24"><h3 style="margin:0 0 6px">🔒 Login</h3><p style="color:#94a3b8;font-size:13px;margin:0">Inicia sesión para acceder a rutas protegidas</p></div>` },
    ]);

    const PROTECTED = ["/perfil", "/ajustes"];

    demoRouter.beforeEach((to) => {
      if (PROTECTED.includes(to) && !isLoggedIn.value) return "/login";
    });

    const btn = (color: string, label: string, onClick: () => void) =>
      html`<button style=${"padding:6px 14px;background:" + color + ";color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px"}
        @click=${onClick}>${label}</button>`;

    html`
      <div style="display:flex;flex-direction:column;gap:14px">
        <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:8px;background:#0f172a;border:1px solid #1e293b">
          <span style="font-size:13px;color:#94a3b8">Estado:</span>
          <span style="${() => "font-weight:600;font-size:13px;color:" + (isLoggedIn.value ? "#22c55e" : "#ef4444")}">
            ${() => isLoggedIn.value ? "✅ Autenticado" : "❌ No autenticado"}
          </span>
          ${() => btn(isLoggedIn.value ? "#ef4444" : "#22c55e",
      isLoggedIn.value ? "Cerrar sesión" : "Iniciar sesión",
      () => { isLoggedIn.value = !isLoggedIn.value; })}
        </div>
        <nav style="display:flex;gap:8px;flex-wrap:wrap">
          ${btn("#3b82f6", "🏠 Inicio", () => demoRouter.navigate("/"))}
          ${btn("#8b5cf6", "👤 Perfil", () => demoRouter.navigate("/perfil"))}
          ${btn("#8b5cf6", "⚙️ Ajustes", () => demoRouter.navigate("/ajustes"))}
          ${btn("#f59e0b", "🔒 Login", () => demoRouter.navigate("/login"))}
        </nav>
        <div style="font-size:12px;color:#64748b">
          Ruta activa: <code style="color:#38bdf8">${() => demoRouter.current.value}</code>
          ${() => PROTECTED.includes(demoRouter.current.value) && !isLoggedIn.value
        ? html`<span style="color:#ef4444;margin-left:8px">⛔ Redirigido por guard</span>`
        : null}
        </div>
        <div style="padding:16px;border-radius:8px;border:1px solid #1e293b;background:#0f172a;min-height:70px">
          ${new RouterView()}
        </div>
        <p style="font-size:11px;color:#475569;margin:0">
          El guard <code>beforeEach</code> redirige a <code>/login</code> cuando se navega a
          una ruta protegida sin autenticación. Inicia sesión y vuelve a pulsar los botones.
        </p>
      </div>
    `.mount(demo20El as Element);
  }
}

