# Nix.js

[![npm version](https://img.shields.io/npm/v/@deijose/nix-js.svg)](https://www.npmjs.com/package/@deijose/nix-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-524%20passing-brightgreen.svg)](https://github.com/DeijoseDevelop/nix-js/tree/main/src/__tests__)
[![Coverage](https://img.shields.io/badge/coverage-95.86%25-brightgreen.svg)]()
[![Bundle size](https://img.shields.io/badge/min%2Bgzip-~14%20KB-orange.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-first-3178C6.svg)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)]()
[![Website](https://img.shields.io/badge/website-nix--js-indigo.svg)](https://nix-js.dev/)
[![Benchmarks](https://img.shields.io/badge/benchmarks-interactive-red.svg)](https://github.com/DeijoseDevelop/nix-js-framework-benchmark)

> A lightweight, fully reactive micro-framework for building modern web UIs — no virtual DOM, no compiler, no build-time magic. Just signals, tagged templates, and pure TypeScript.
>
> **[→ Documentation & Live Demo](https://nix-js.dev/) | [→ Performance Benchmarks](https://js-benchmark.nix-js.dev/)**

```
~14 KB gzipped · zero dependencies · TypeScript-first · ES2022
```

---

## Table of Contents

- [Nix.js](#nixjs)
  - [Table of Contents](#table-of-contents)
  - [Overview](#overview)
    - [Architecture at a glance](#architecture-at-a-glance)
  - [Installation \& Setup](#installation--setup)
    - [Development (from source)](#development-from-source)
    - [Project structure](#project-structure)
  - [Subpath Imports (Tree-Shaking)](#subpath-imports-tree-shaking)
  - [Quick Start](#quick-start)
  - [Core Concepts](#core-concepts)
  - [Reactivity](#reactivity)
    - [`signal`](#signal)
    - [`computed`](#computed)
    - [`effect`](#effect)
    - [`batch`](#batch)
    - [`watch`](#watch)
    - [`untrack`](#untrack)
    - [`nextTick`](#nexttick)
  - [Templates](#templates)
    - [`html` tag](#html-tag)
    - [Text bindings](#text-bindings)
    - [Attribute bindings](#attribute-bindings)
      - [Attribute value safety (XSS)](#attribute-value-safety-xss)
    - [Event bindings \& modifiers](#event-bindings--modifiers)
    - [Conditional rendering](#conditional-rendering)
    - [List rendering](#list-rendering)
    - [Keyed lists: `repeat()`](#keyed-lists-repeat)
    - [DOM refs: `ref()`](#dom-refs-ref)
  - [Components](#components)
    - [Function components](#function-components)
    - [Class components: `NixComponent`](#class-components-nixcomponent)
    - [Lifecycle hooks](#lifecycle-hooks)
    - [`mount()`](#mount)
  - [Children \& Slots](#children--slots)
    - [Default slot: `children`](#default-slot-children)
    - [Named slots](#named-slots)
    - [Children in function components](#children-in-function-components)
    - [`NixChildren` type](#nixchildren-type)
  - [Dependency Injection](#dependency-injection)
    - [`provide` / `inject`](#provide--inject)
    - [`createInjectionKey`](#createinjectionkey)
  - [Global Stores](#global-stores)
    - [`createStore`](#createstore)
    - [Advanced Store Patterns (v2.2.0)](#advanced-store-patterns-v220)
      - [Store Primitives \& Lifecycle](#store-primitives--lifecycle)
      - [Plugin System](#plugin-system)
      - [Security \& Robustness](#security--robustness)
  - [Router](#router)
    - [`createRouter`](#createrouter)
    - [Router DI at Mount Root](#router-di-at-mount-root)
    - [Route Metadata (meta)](#route-metadata-meta)
    - [Router Scroll Restoration](#router-scroll-restoration)
    - [Router Hash Mode](#router-hash-mode)
    - [Named Routes](#named-routes)
    - [`RouterView`](#routerview)
    - [`Link`](#link)
    - [`useRouter` / `nixRouter`](#userouter--nixrouter)
    - [Nested routes](#nested-routes)
    - [Query parameters](#query-parameters)
  - [Async \& Lazy Loading](#async--lazy-loading)
    - [`suspend()`](#suspend)
      - [Re-fetching with `invalidate`](#re-fetching-with-invalidate)
    - [`createQuery()` / `invalidateQueries()`](#createquery--invalidatequeries)
    - [`lazy()`](#lazy)
    - [Route Guards](#route-guards)
      - [`router.beforeEach(guard)` — global guard](#routerbeforeeachguard--global-guard)
      - [`beforeEnter` — per-route guard](#beforeenter--per-route-guard)
      - [Async guards](#async-guards)
      - [Type](#type)
  - [Forms](#forms)
    - [`useField()`](#usefield)
      - [`validateOn`](#validateon)
      - [Field type coercion](#field-type-coercion)
    - [`createForm()`](#createform)
    - [Nested Form Fields (Dot-Path)](#nested-form-fields-dot-path)
    - [Cross-Field Validation](#cross-field-validation)
    - [`useFieldArray()`](#usefieldarray)
    - [Built-in validators](#built-in-validators)
    - [Zod / Valibot interop](#zod--valibot-interop)
    - [Server-side errors](#server-side-errors)
  - [show / hide directive](#show--hide-directive)
    - [`show` attribute](#show-attribute)
    - [`hide` attribute](#hide-attribute)
    - [`showWhen()`](#showwhen)
    - [show vs conditional rendering](#show-vs-conditional-rendering)
  - [Portal](#portal)
    - [Basic usage](#basic-usage)
    - [Reactive portal](#reactive-portal)
    - [Custom target](#custom-target)
  - [Portal Ergonomics](#portal-ergonomics)
    - [Option A: Outlet token](#option-a-outlet-token)
    - [Option B: Ref as target](#option-b-ref-as-target)
    - [Option C: Provide / inject](#option-c-provide--inject)
  - [Error Boundaries](#error-boundaries)
    - [Basic usage](#basic-usage-1)
    - [NixComponent content](#nixcomponent-content)
    - [Reactive errors](#reactive-errors)
    - [Nested boundaries](#nested-boundaries)
    - [What is and isn't caught](#what-is-and-isnt-caught)
  - [Transitions](#transitions)
    - [Basic enter/leave transition](#basic-enterleave-transition)
    - [appear — transition on first render](#appear--transition-on-first-render)
    - [Custom class names](#custom-class-names)
    - [JS hooks](#js-hooks)
    - [TransitionOptions reference](#transitionoptions-reference)
  - [API Reference](#api-reference)
    - [Reactivity](#reactivity-1)
    - [Signal methods](#signal-methods)
    - [Templates](#templates-1)
    - [Components](#components-1)
    - [Dependency Injection](#dependency-injection-1)
    - [Stores](#stores)
    - [Router](#router-1)
    - [Async](#async)
    - [Forms](#forms-1)
    - [show / hide](#show--hide)
    - [Portal](#portal-1)
    - [Error Boundaries](#error-boundaries-1)
    - [Transitions](#transitions-1)
  - [What's Included](#whats-included)
  - [Comparison with Other Frameworks](#comparison-with-other-frameworks)
    - [Runtime \& Architecture](#runtime--architecture)
    - [Built-in Features](#built-in-features)
  - [Known Limitations](#known-limitations)
  - [Contributing](#contributing)
  - [License](#license)

---

## Overview

Nix.js is a signal-based reactive micro-framework. Its design goals are:

- **No virtual DOM.** Bindings update individual DOM nodes directly via `effect()`.
- **No compiler.** Templates are standard JavaScript tagged template literals.
- **Fine-grained reactivity.** Only the exact text nodes and attributes that depend on a changed signal are updated — no diffing of full component trees.
- **Zero runtime dependencies.** The minified bundle is ~24 KB (~14 KB gzipped) with no `node_modules` at runtime.
- **TypeScript-first.** Every public API is fully typed, including typed injection keys and typed store signals.

### Architecture at a glance

```
                          ┌─────────────────────────────────────────┐
                          │            Nix.js Architecture          │
                          └─────────────────────────────────────────┘

  ┌─── Reactivity Layer ──────────────────────────────────────────────────────┐
  │  signal()  ──  computed()  ──  effect()  ──  batch()  ──  watch()        │
  └───────────────────────────┬───────────────────────────────────────────────┘
                              │
  ┌─── Rendering Layer ───────┼───────────────────────────────────────────────┐
  │  html``  ──  repeat()  ── ref()  ──  portal()  ──  transition()          │
  │                           │                                              │
  │              binding ─────┤─ text node                                   │
  │                           ├─ attribute     (reactive via effect)          │
  │                           └─ child node                                  │
  └───────────────────────────┬───────────────────────────────────────────────┘
                              │
  ┌─── Component Layer ───────┼───────────────────────────────────────────────┐
  │  NixTemplate (fn components)  ──  NixComponent (lifecycle)  ──  mount()  │
  │  lifecycle hooks  ──  children / slots                                   │
  └───────────────────────────┬───────────────────────────────────────────────┘
                              │
  ┌─── Application Layer ─────┼───────────────────────────────────────────────┐
  │  createRouter()     createStore()     provide() / inject()               │
  │  useField()         createForm()      suspend() / lazy()                 │
  │  createErrorBoundary()                showWhen()                         │
  └───────────────────────────────────────────────────────────────────────────┘
```

Each interpolation inside `html`` creates at most one `effect()`. When a signal changes, only the DOM nodes bound to that signal are updated.

---

## Installation & Setup

Nix.js uses [Vite](https://vitejs.dev/) as its dev server and bundler.

```bash
# Install as a dependency
npm install @deijose/nix-js
# or
bun add @deijose/nix-js
```

```typescript
import { signal, html, NixComponent, mount } from "@deijose/nix-js";
```

### Development (from source)

```bash
# Start development server
npm run dev   # or: bun dev

# Type check
npx tsc --noEmit

# Production build
npm run build
```

### Project structure

```
src/
  nix/
    reactivity.ts   — signal, effect, computed, batch, watch, untrack, nextTick
    template.ts     — html``, repeat(), ref()
    lifecycle.ts    — NixComponent base class
    component.ts    — mount()
    store.ts        — createStore()
    router.ts       — createRouter(), RouterView, Link, useRouter()
    async.ts        — suspend(), lazy(), createQuery() with built-in caching
    context.ts      — provide(), inject(), createInjectionKey()
    index.ts        — re-exports everything
  main.ts           — application entry point
index.html
```

Import everything from the single entry point:

```typescript
import {
  signal, computed, effect, batch, watch, untrack, nextTick,
  html, repeat, ref,
  NixComponent, mount,
  createStore,
  createRouter, RouterView, Link, useRouter,
  suspend, lazy,
  provide, inject, createInjectionKey,
} from "./nix";
```

---

## Subpath Imports (Tree-Shaking)

When you only need one module, import from subpaths:

```typescript
import { signal, effect } from "@deijose/nix-js/signals";
import { createRouter } from "@deijose/nix-js/router";
import { createStore } from "@deijose/nix-js/store";
import { createForm } from "@deijose/nix-js/form";
import { suspend, lazy } from "@deijose/nix-js/async";
import { html, repeat, transition } from "@deijose/nix-js/template";
import { mount } from "@deijose/nix-js/component";
import { NixComponent } from "@deijose/nix-js/lifecycle";
import { provide, inject, createInjectionKey } from "@deijose/nix-js/context";
import { enableDevTools } from "@deijose/nix-js/devtools";
```

This is optional: `import { ... } from "@deijose/nix-js"` remains fully supported.

---

## Quick Start

A complete mini-app showing both component styles — function components (`NixTemplate`) for pages, class components (`NixComponent`) when lifecycle hooks are needed:

```typescript
import {
  signal, html, NixComponent, mount,
  createRouter, RouterView, Link, nixRouter,
} from "@deijose/nix-js";

// --- Pages as function components (NixTemplate) ---
// A plain function that returns html`` is all you need for pages
// and purely display components — no class, no lifecycle boilerplate.

function HomePage(): NixTemplate {
  const count = signal(0);
  return html`
    <h1>Home</h1>
    <p>Count: ${() => count.value}</p>
    <button @click=${() => count.value++}>Increment</button>
  `;
}

function UserPage(): NixTemplate {
  const router = nixRouter();
  return html`<h1>User: ${() => router.params.value.id}</h1>`;
}

// --- Stateful component as class component (NixComponent) ---
// Use a class when you need onInit / onMount / onUnmount / onError hooks.

class Clock extends NixComponent {
  private time = signal(new Date().toLocaleTimeString());
  private _id = 0;

  onMount() {
    this._id = setInterval(() => {
      this.time.value = new Date().toLocaleTimeString();
    }, 1000);
    return () => clearInterval(this._id); // auto-cleanup on unmount
  }

  render() {
    return html`<p>Clock: ${() => this.time.value}</p>`;
  }
}

// --- Router ---

const router = createRouter([
  { path: "/",         component: () => HomePage() },
  { path: "/user/:id", component: () => UserPage() },
]);

// --- App shell (function component) ---

function App(): NixTemplate {
  return html`
    <nav>
      ${new Link("/", "Home")}
      ${new Link("/user/42", "User 42")}
    </nav>
    ${new Clock()}
    ${new RouterView()}
  `;
}

mount(App(), "#app", { router });
```

This gives you:
- **`NixTemplate`** (function components) for pages — minimal boilerplate, signals close over the function scope
- **`NixComponent`** (class components) for the `Clock` — `onMount` starts the interval and returns its cleanup
- **Dynamic route params** on `/user/:id` via `nixRouter()`
- **Client-side navigation** via `Link` with `pushState` (no page reloads)

---

## Core Concepts

Nix.js is built around three primitives:

| Primitive | Role |
|-----------|------|
| `signal(v)` | A reactive value. Reading it inside an `effect` creates a subscription. |
| `effect(fn)` | A function that re-runs whenever any signal it read changes. |
| `html\`\`` | A tagged template that turns an HTML string + bindings into a live DOM fragment. |

Everything else — `computed`, `watch`, `repeat`, `NixComponent`, `createStore`, the router, `provide`/`inject` — is built on top of these three primitives.

---

## Reactivity

### `signal`

Creates a reactive container for a single value.

```typescript
const count = signal(0);

count.value;              // get — 0
count.value = 1;          // set — notifies subscribers
count.update(n => n + 1); // set via updater function
count.peek();             // get WITHOUT subscribing (no tracking)
count.dispose();          // remove all subscribers
```

Signals use `Object.is` equality — setting the same value does nothing.

### `computed`

A derived signal whose value is recalculated automatically when its dependencies change.

```typescript
const price  = signal(10);
const qty    = signal(3);
const total  = computed(() => price.value * qty.value);

console.log(total.value); // 30

price.value = 20;
console.log(total.value); // 60 — updated automatically
```

`computed` returns a `Signal<T>`, so it has `.value`, `.peek()`, etc.

By default it uses `Object.is` to decide whether to notify subscribers. For derived values that return new objects/arrays with the same content, pass a custom equality comparator:

```typescript
const items = signal(["a", "b"]);
const upper = computed(
  () => items.value.map(i => i.toUpperCase()),
  (a, b) => a.length === b.length && a.every((v, i) => v === b[i])
);

items.value = ["a", "b"]; // same upper-case result; no notification
```

### `effect`

Runs a function immediately and re-runs it whenever any signal read inside it changes. Returns a `dispose` function to stop the effect.

```typescript
const name = signal("Alice");

const dispose = effect(() => {
  document.title = `Hello, ${name.value}`;
  // optional — return a cleanup function:
  return () => console.log("effect cleaned up");
});

name.value = "Bob"; // re-runs the effect → document.title = "Hello, Bob"

dispose(); // stops the effect
```

Effects are **self-cleaning**: before each re-run, the previous cleanup (if any) is called and all old subscriptions are dropped. This prevents stale subscriptions to signals that are no longer read.

### `batch`

Groups multiple signal writes into a single effect flush. Without `batch`, each write triggers its effects individually.

```typescript
const x = signal(0);
const y = signal(0);

effect(() => console.log(x.value + y.value));

// Without batch: effect runs twice
x.value = 1;
y.value = 2;

// With batch: effect runs once, at the end
batch(() => {
  x.value = 10;
  y.value = 20;
});
```

### `watch`

Watches a reactive source and calls a callback with `(newValue, oldValue)` when it changes. Unlike `effect`, it does **not** run on initialization by default.

```typescript
const count = signal(0);

const stop = watch(count, (newVal, oldVal) => {
  console.log(`${oldVal} → ${newVal}`);
});

count.value = 1; // logs: "0 → 1"

stop(); // stop watching
```

**Options:**

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `immediate` | `boolean` | `false` | Run callback immediately with the current value |
| `once` | `boolean` | `false` | Auto-dispose after the first callback invocation |

```typescript
// Watch a computed expression
watch(
  () => user.value.role,
  (role) => console.log("Role changed:", role),
  { immediate: true }
);

// One-shot watcher
watch(
  isReady,
  () => initApp(),
  { once: true }
);
```

### `untrack`

Reads signals inside `fn` without creating subscriptions. Useful when you need a value but don't want the current `effect` to re-run when that signal changes.

```typescript
const a = signal(1);
const b = signal(2);

effect(() => {
  const aVal = a.value;                   // subscribed — effect re-runs when a changes
  const bVal = untrack(() => b.value);    // NOT subscribed — b changes won't trigger this
  console.log(aVal + bVal);
});
```

### `nextTick`

Returns a `Promise<void>` that resolves after the current synchronous effect queue has flushed. Use it to read the DOM after a reactive change.

```typescript
const text = signal("hello");

text.value = "world";
await nextTick();
console.log(document.querySelector("#el")?.textContent); // "world"

// Callback variant:
await nextTick(() => inputRef.el?.focus());
```

---

## Templates

### `html` tag

`html` is a tagged template literal that returns a `NixTemplate`. It parses the HTML once and creates a `DocumentFragment` with live bindings.

```typescript
import { html, signal, mount } from "./nix";

const name = signal("world");
const tpl  = html`<h1>Hello, ${() => name.value}!</h1>`;

mount(tpl, "#app");
name.value = "Nix"; // DOM updates automatically
```

### Text bindings

| Syntax | Behavior |
|--------|----------|
| `${value}` | Static — inserted once as a text node |
| `${() => expr}` | Reactive — updates the text node whenever signals inside change |

```typescript
const count = signal(0);

html`
  <p>Static: ${"hello"}</p>
  <p>Reactive: ${() => count.value}</p>
  <p>Expression: ${() => count.value > 0 ? "positive" : "zero or negative"}</p>
`
```

### Attribute bindings

```typescript
const active  = signal(true);
const label   = signal("Submit");
const classes = signal("btn btn-primary");

html`
  <button
    class=${classes}
    disabled=${() => !active.value}
    aria-label=${() => label.value}
  >Submit</button>
`
```

- Static value → set once.
- `() => value` → reactive, updates via `effect`.
- `null`, `undefined`, or `false` → attribute is **removed**.

> **Important:** Each attribute binding must be a single interpolation that covers the entire value. Partial interpolation inside a string is not supported:
>
> ```typescript
> // ✅ Correct — the whole value is one interpolation
> html`<div class=${() => `item ${active.value ? "active" : ""}`}>`
>
> // ❌ Incorrect — mixing a literal prefix with an interpolation
> html`<div class="item ${() => active.value ? 'active' : ''}">`
> ```

#### Attribute value safety (XSS)

Interpolated values are always inserted as text nodes or via `setAttribute`, so they are never parsed as HTML — there is no markup-injection vector through interpolation.

On top of that, **URL-bearing attributes are sanitized**. When you bind a value to `href`, `src`, `action`, `formaction`, `xlink:href`, `poster`, `background`, `cite`, `ping`, or `data`, Nix blocks dangerous schemes:

```typescript
// Blocked — the attribute is set to "" and a warning is logged
html`<a href=${() => userProvidedUrl}>Profile</a>`;
// userProvidedUrl = "javascript:steal()"        → href=""
// userProvidedUrl = "data:text/html,<script>…"  → href=""

// Allowed
html`<a href=${"https://example.com"}>ok</a>`;       // normal URLs
html`<img src=${"data:image/png;base64,iVBOR…"}>`;   // raster data URIs
```

- Obfuscation via whitespace, control characters, BOM, or line separators (e.g. `"java\tscript:…"`) is normalized away before the scheme check.
- `data:image/svg+xml` is rejected on purpose (SVG can carry inline script); raster `data:image/*` URIs are allowed.
- **Performance:** only URL attributes run the check, and only when their value changes. `class`, `style`, `aria-*`, `data-*`, and custom attributes are never sanitized and keep their exact code path.
- Sanitization is exposed for reuse: `import { sanitizeUrl } from "@deijose/nix-js/template"`.

> Events must use the `@event` syntax. Binding a value to an `on*` attribute (e.g. `onclick=${…}`) or `srcdoc` logs a warning, since that turns an untrusted value into executable code.

### Event bindings & modifiers

Events are bound with `@eventname=`:

```typescript
const count = signal(0);

html`
  <button @click=${() => count.value++}>Increment</button>
  <input  @input=${(e: Event) => console.log((e.target as HTMLInputElement).value)} />
`
```

**Modifiers** are chained after the event name with `.`:

| Modifier | Effect |
|----------|--------|
| `.prevent` | `e.preventDefault()` |
| `.stop` | `e.stopPropagation()` |
| `.once` | Listener removed after first call |
| `.capture` | `useCapture = true` |
| `.passive` | `passive: true` (performance hint) |
| `.self` | Handler runs only when `e.target === e.currentTarget` |
| `.enter` | Only fires when `Enter` key is pressed |
| `.escape` | Only fires on `Escape` |
| `.space` | Only fires on Space |
| `.tab`, `.delete`, `.backspace` | Corresponding keys |
| `.up`, `.down`, `.left`, `.right` | Arrow keys |
| `.a`–`.z`, `.0`–`.9` | Single character key filter |

```typescript
html`
  <form @submit.prevent=${handleSubmit}>
    <input @keydown.enter=${submitOnEnter} />
    <button @click.stop.once=${doOnce}>Once</button>
  </form>
`
```

### Conditional rendering

Return a `NixTemplate` or `null`/`false` from a function binding:

```typescript
const show = signal(true);

html`
  <div>
    ${() => show.value
      ? html`<p>Visible content</p>`
      : null
    }
  </div>
`
```

When the condition changes, the previous DOM is fully cleaned up (effects disposed, `onUnmount` called) and the new branch is rendered.

### List rendering

For simple, stable lists:

```typescript
const items = ["Apple", "Banana", "Cherry"];

html`
  <ul>
    ${items.map(item => html`<li>${item}</li>`)}
  </ul>
`
```

For reactive lists that change over time, prefer `repeat()`.

### Keyed lists: `repeat()`

`repeat()` enables efficient diffing: DOM nodes for unchanged keys are preserved and **only** added, removed, or reordered items are touched.

```typescript
import { repeat } from "./nix";

const todos = signal([
  { id: 1, text: "Buy milk" },
  { id: 2, text: "Write docs" },
]);

html`
  <ul>
    ${() => repeat(
      todos.value,
      todo => todo.id,               // key function — must be unique
      todo => html`<li>${todo.text}</li>`
    )}
  </ul>
`
```

**Signature:**
```typescript
function repeat<T>(
  items: T[],
  keyFn: (item: T, index: number) => string | number,
  renderFn: (item: T, index: number) => NixTemplate | NixComponent
): KeyedList<T>
```

### DOM refs: `ref()`

`ref()` creates a typed container that is filled with the actual DOM element after mount, and cleared on unmount.

```typescript
import { ref } from "./nix";

const inputRef = ref<HTMLInputElement>();

const tpl = html`<input ref=${inputRef} type="text" />`;

mount(tpl, "#app");

// inputRef.el is now the <input> element
inputRef.el?.focus();
inputRef.el?.value; // ""
```

The `NixRef<T>` type:

```typescript
interface NixRef<T extends Element = Element> {
  el: T | null;
}
```

---

## Components

### Function components

The simplest and most common form: a plain function that calls `html\`\`` and returns a `NixTemplate`. This is the **recommended pattern for pages and purely display components** — signals close over the function's scope and update the DOM directly, with no class boilerplate.

```typescript
import { html, signal, mount } from "./nix";

function Counter(): NixTemplate {
  const count = signal(0);
  return html`
    <div>
      <p>${() => count.value}</p>
      <button @click=${() => count.value++}>+</button>
    </div>
  `;
}

mount(Counter(), "#app");

// Function components integrate seamlessly with the router:
// createRouter([{ path: "/counter", component: () => Counter() }]);
```

### Class components: `NixComponent`

Extend `NixComponent` **only when you need lifecycle hooks** (`onInit`, `onMount`, `onUnmount`, `onError`). Common cases: timers, data fetching, external subscriptions, cleanup.

```typescript
import { NixComponent, html, signal } from "./nix";

class Timer extends NixComponent {
  count = signal(0);
  private _id = 0;

  onMount() {
    this._id = setInterval(() => this.count.update(n => n + 1), 1000);
    return () => clearInterval(this._id); // cleanup
  }

  render() {
    return html`<span>${() => this.count.value}s</span>`;
  }
}

mount(new Timer(), "#app");
```

Use class components in templates exactly like any other value:

```typescript
html`<div>${new Timer()}</div>`
```

### Lifecycle hooks

All hooks are optional:

```typescript
class MyComponent extends NixComponent {
  // ① Called BEFORE render(), no DOM yet.
  //    Use it to initialize derived state or call provide().
  onInit() {
    this.derived = computed(() => this.base.value * 2);
    provide(MY_KEY, this.value);
  }

  // ② Must be implemented. Returns the template. Called once.
  render(): NixTemplate {
    return html`...`;
  }

  // ③ Called AFTER the component is inserted into the DOM.
  //    Return a function for automatic cleanup on unmount.
  onMount() {
    const id = addEventListener("resize", this._onResize);
    return () => removeEventListener("resize", this._onResize);
  }

  // ④ Called BEFORE the component is removed from the DOM.
  onUnmount() {
    console.log("bye!");
  }

  // ⑤ Catches errors thrown inside onInit(), render() and onMount().
  //    If not implemented, errors are re-thrown.
  onError(err: unknown) {
    console.error("Component error:", err);
  }
}
```

**Execution order:**

```
new MyComponent()
      ↓
  onInit()        ← no DOM, synchronous
      ↓
  render()        ← returns NixTemplate
      ↓
  [DOM inserted]
      ↓
  onMount()       ← DOM available; return value = cleanup fn
      ↓
  ...reactive updates...
      ↓
  onUnmount()     ← DOM still present
  cleanup from onMount()
      ↓
  [DOM removed]
```

### `mount()`

Mounts a `NixTemplate` or `NixComponent` into the DOM. Returns a handle with an `unmount()` method.

```typescript
// Function component
const handle = mount(Counter(), "#app");

// Class component
const handle = mount(new Timer(), document.getElementById("app")!);

// With router instance
const handle = mount(App(), "#app", { router });

// Unmount later
handle.unmount(); // runs onUnmount, disposes all effects, removes DOM
```

---

## Children & Slots

Nix.js lets you pass content **into** a component from the outside — just like `children` in React or `<slot>` in Vue — without any compiler magic.

### Default slot: `children`

Any class component exposes a `children` property. Set it with `setChildren()` and render it with `${this.children}` anywhere in the template.

```typescript
import { NixComponent, html, mount } from "@deijose/nix-js";

class Card extends NixComponent {
  render() {
    return html`
      <div class="card">
        ${this.children}
      </div>
    `;
  }
}

// Pass content from outside:
const app = new Card().setChildren(
  html`<p>Hello from inside the card</p>`
);

mount(app, "#app");
```

`setChildren()` returns `this`, so you can chain it:

```typescript
html`${new Card().setChildren(html`<p>Card content here</p>`)}`
```

The child can be a template, another component, an array, or a reactive signal expression — anything you can interpolate in `html``:

```typescript
const label = signal("Hello");

new Card().setChildren(
  html`<strong>${() => label.value}</strong>` // reactive!
);
```

### Named slots

For components with multiple injection points (header, body, footer), use `setSlot(name, content)` and retrieve them inside `render()` with `this.slot(name)`:

```typescript
class PageLayout extends NixComponent {
  render() {
    return html`
      <div class="layout">
        <header class="layout-header">
          ${this.slot("header")}
        </header>

        <main class="layout-body">
          ${this.children}
        </main>

        <footer class="layout-footer">
          ${this.slot("footer")}
        </footer>
      </div>
    `;
  }
}

// Fluent: chain setSlot() + setChildren()
const page = new PageLayout()
  .setSlot("header", html`<h1>My App</h1>`)
  .setChildren(html`<p>Main content goes here.</p>`)
  .setSlot("footer", html`<small>© 2026</small>`);

mount(page, "#app");
```

If a slot has no content assigned, `this.slot(name)` returns `undefined` and renders nothing — no error.
You can provide a fallback with the `??` operator:

```typescript
${this.slot("header") ?? html`<h1>Default Title</h1>`}
```

### Children in function components

For function components, pass children as a plain prop:

```typescript
import type { NixChildren } from "@deijose/nix-js";

function Card({ children }: { children?: NixChildren }) {
  return html`<div class="card">${children}</div>`;
}

const app = Card({
  children: html`<p>Card content</p>`,
});

mount(app, "#app");
```

### `NixChildren` type

```typescript
type NixChildren =
  | NixTemplate                           // html`` result
  | NixComponent                          // class component instance
  | Array<NixTemplate | NixComponent>     // mix of both
  | null
  | undefined;
```

---

## Dependency Injection

Nix.js provides a Vue-style `provide`/`inject` system for passing data down a component tree without prop drilling.

### `provide` / `inject`

- `provide(key, value)` — call inside `onInit()` to make a value available to all descendant components.
- `inject(key)` — retrieve the closest provided value for `key`, or `undefined` if none was provided.

```typescript
import { provide, inject, createInjectionKey } from "./nix";

const THEME_KEY = createInjectionKey<Signal<string>>("theme");

class ThemeProvider extends NixComponent {
  theme = signal("dark");

  onInit() {
    provide(THEME_KEY, this.theme); // make available to all descendants
  }

  render() {
    return html`<div>${new ThemedButton()}</div>`;
  }
}

class ThemedButton extends NixComponent {
  theme = inject(THEME_KEY); // Signal<string> | undefined

  render() {
    const style = () =>
      `background:${this.theme?.value === "dark" ? "#1e293b" : "#f0f9ff"}`;
    return html`<button style=${style}>Click me</button>`;
  }
}
```

**Rules:**
- `provide()` must be called inside `onInit()` (or a constructor), never at the module level.
- `inject()` searches from the current component up through its ancestors. The **nearest** ancestor wins.
- Calling `provide()` outside a component context throws an error.
- Calling `inject()` outside a component context returns `undefined` silently.

### `createInjectionKey`

Creates a globally unique, typed symbol to use as a key. Typed keys prevent mismatches between provider and consumer.

```typescript
import type { InjectionKey } from "./nix";

// Typed key — Signal<string> is the shape of the provided value
const LOCALE_KEY: InjectionKey<Signal<string>> = createInjectionKey("locale");
const USER_KEY:   InjectionKey<User>           = createInjectionKey("user");
```

---

## Global Stores

### `createStore`

Creates a reactive global store. Every property of the initial state becomes a `Signal`. An optional `options` object (`{ name?, actions?, getters?, plugins? }`) adds typed actions, computed getters, and plugins.

```typescript
import { createStore } from "./nix";

// Basic store — no actions
const theme = createStore({ dark: true, fontSize: 16 });

theme.dark.value = false;           // write
theme.fontSize.value;               // read
theme.$reset();                     // restore all signals to initial values

theme.$state;                       // reactive read-only snapshot: { dark: false, fontSize: 16 }
theme.$patch({ dark: true });       // batch update multiple signals
```

**With actions:**

```typescript
const cart = createStore(
  {
    items: [] as string[],
    total: 0,
  },
  {
    actions: (s) => ({
      add:    (item: string) => s.items.update(arr => [...arr, item]),
      remove: (item: string) => s.items.update(arr => arr.filter(i => i !== item)),
      clear:  ()             => cart.$reset(),
    }),
  }
);

cart.add("Milk");
cart.items.value;   // ["Milk"]
cart.clear();
cart.items.value;   // []
```

**Types:**

```typescript
// StoreSignals<T> — the signals object
type StoreSignals<T> = { readonly [K in keyof T]: Signal<T[K]> };

// Store<T, A> — signals + actions + $reset + $patch + $state
type Store<T, A> = StoreSignals<T> & A & {
  readonly $state: T;
  $reset(): void;
  $patch(partial: Partial<T>): void;
};
```

### Advanced Store Patterns (v2.2.0)

`createStore` features a reactive-native architecture with a robust plugin system, batched updates, and built-in protection against common pitfalls.

```typescript
const store = createStore(
  { count: 0, items: [] as string[] },
  {
    name: "my-store", // Optional ID for plugins/debugging
    actions: (s) => ({
      increment: () => s.count.value++,
      addItem: (name: string | string[]) => {
        // Automatic batching for multiple signal updates
        if (Array.isArray(name)) s.items.value = [...s.items.value, ...name];
        else s.items.value = [...s.items.value, name];
      },
    }),
    getters: (s) => ({
      double: computed(() => s.count.value * 2), // Getters must return signals
      total: computed(() => s.items.value.length),
    }),
    plugins: [persistPlugin],
  }
);
```

#### Store Primitives & Lifecycle

- **`$id`**: The store identifier (defaults to "store").
- **`$state`**: Readonly snapshot. Reading it inside an effect creates a subscription to the **entire** store.
- **`$stateSignal`**: The underlying computed signal of the state. Perfect for plugin authors.
- **`$watch(cb, options?)`**: Replaces `$subscribe`. Directly uses the core `watch()` primitive for deep or immediate observation.
- **`$patch(partial)`**: Updates multiple signals at once, correctly batched for performance.
- **`$dispose()`**: Destroys the store, disposes internal signals, and runs all plugin cleanups.

#### Plugin System

Plugins are simple functions that receive the store instance. They can extend state, intercept mutations, or synchronize with external APIs.

```typescript
const persistPlugin: NixPlugin<MyState> = (store) => {
  const saved = localStorage.getItem(`nix_${store.$id}`);
  if (saved) store.$patch(JSON.parse(saved));

  const unsub = store.$watch((state) => {
    localStorage.setItem(`nix_${store.$id}`, JSON.stringify(state));
  });

  return unsub; // Automatically called on store.$dispose()
};
```

#### Security & Robustness

- **Prototype Protection**: `createStore` blocks keys like `__proto__` or `constructor` to prevent prototype pollution.
- **State Integrity**: `initialState` is validated via `structuredClone`. If it contains non-serializable data (like functions or DOM nodes), Nix throws a descriptive error.
- **Read-only Safety**: Getters and internal signals are protected. Attempting to mutate or dispose them directly will throw an informative error.

---

## Router

A client-side History API router with dynamic parameters, query strings, nested routes, and reactive active-link styling.

### `createRouter`

Call once at app startup. Sets up the router singleton consumed by `RouterView`, `Link`, and `nixRouter` / `useRouter`.

```typescript
import { createRouter, RouterView, Link } from "./nix";

const router = createRouter([
  { path: "/",        component: () => new HomePage()    },
  { path: "/about",   component: () => new AboutPage()   },
  { path: "/users/:id", component: () => new UserDetail() },
  { path: "*",        component: () => new NotFound()    },
]);
```

The `Router` interface exposes:

| Property / Method | Type | Description |
|-------------------|------|-------------|
| `current` | `Signal<string>` | Active pathname (`/users/42`) |
| `params` | `Signal<Record<string, string>>` | Dynamic route params (`{ id: "42" }`) |
| `query` | `Signal<Record<string, string>>` | Query string params (`{ page: "2" }`) |
| `navigate(path, options?)` | `void` | Navigate via `pushState` (`options.query` for query params) |
| `replace(path, options?)` | `void` | Navigate via `replaceState` (no new history entry; `options.query` for query params) |
| `back()` | `void` | Go back one entry (`history.back()`) |
| `forward()` | `void` | Go forward one entry (`history.forward()`) |
| `go(delta)` | `void` | Move `delta` entries in history |
| `isActive(path, exact?)` | `boolean` | Check if a path is currently active |
| `resolve(path)` | `ResolvedRoute` | Inspect what would match without navigating |
| `beforeEach(guard)` | `() => void` | Register a global guard; returns removal fn |
| `afterEach(hook)` | `() => void` | Register a post-navigation hook; returns removal fn |
| `routes` | `RouteRecord[]` | Original route tree |

### Router DI at Mount Root

You can provide a router instance per mounted app tree:

```typescript
const routerA = createRouter(routesA);
const routerB = createRouter(routesB);

mount(AppA(), "#app-a", { router: routerA });
mount(AppB(), "#app-b", { router: routerB });
```

`nixRouter()` resolves in this order:

1. Injected router from context (`mount(..., { router })`)
2. Singleton fallback (legacy `createRouter(...)` behavior)

This enables isolated router instances for testing and micro-frontend scenarios while keeping backward compatibility.

### Route Metadata (meta)

Route records support an optional `meta` object. The matched route metadata is exposed through `router.resolve(path)`.

```typescript
interface RouteRecord {
  path: string;
  component: () => NixTemplate | NixComponent;
  meta?: Record<string, unknown>;
}

const router = createRouter([
  { path: "/", component: () => HomePage() },
  { path: "/admin", component: () => AdminPage(), meta: { auth: true } },
  { path: "/login", component: () => LoginPage() },
]);

router.beforeEach((to) => {
  const m = router.resolve(to);
  if (m.route?.meta?.auth) return "/login";
});
```

### Router Scroll Restoration

The router saves scroll positions in `history.state`, restores them on back/forward, and supports a custom `scrollBehavior` callback.

```typescript
createRouter(routes, {
  scrollBehavior(to, from, saved) {
    if (saved) return saved; // back/forward
    return { left: 0, top: 0 }; // new navigation
  },
});
```

### Router Hash Mode

Use hash mode when your server cannot rewrite route URLs to `index.html`.

```typescript
createRouter(routes, {
  mode: "hash", // default: "history"
});
```

In hash mode, URLs look like `#/users/42` and navigation is driven by `hashchange`.

### Named Routes

Routes can define a stable `name` and be navigated by name with params/query.

```typescript
const router = createRouter([
  { name: "home", path: "/", component: () => HomePage() },
  { name: "user-detail", path: "/users/:id", component: () => UserPage() },
  { name: "search", path: "/search", component: () => SearchPage() },
]);

router.navigate({ name: "user-detail", params: { id: 42 } });
router.navigate({ name: "search", query: { q: "nix", page: 1 } });
router.replace({ name: "user-detail", params: { id: "99" } });

// still valid (non-breaking)
router.navigate("/users/42");
```

Named route errors are explicit:

- Unknown name: throws `No route with name "..."`
- Missing dynamic param: throws `Missing param "..." for route "..."`

### `RouterView`

A `NixComponent` that renders the matched component for a given depth level. Use `new RouterView()` for the root, `new RouterView(1)` for nested child routes.

Both `RouterView` and `Link` accept an optional explicit router as the last constructor argument. When provided, that router is used instead of the global/injected singleton — useful for isolated tests or multi-router applications.

```typescript
class App extends NixComponent {
  render() {
    return html`
      <nav>
        ${new Link("/", "Home")}
        ${new Link("/about", "About")}
      </nav>
      ${new RouterView()}
    `;
  }
}

mount(new App(), "#app");

// With an explicit router (no global singleton needed)
const isolatedRouter = createRouter([
  { path: "/", component: () => html`<p>home</p>` },
  { path: "/about", component: () => html`<p>about</p>` },
]);
const view = new RouterView(0, isolatedRouter);
const link = new Link("/about", "About", isolatedRouter);
```

### `Link`

A reactive `<a>` tag that automatically applies active/inactive styles based on the current route.

```typescript
new Link("/about", "About Us")
// <a href="/about" style="...active/inactive styles...">About Us</a>

// With an explicit router
new Link("/about", "About Us", router)
```

Clicking a `Link` calls `router.navigate()` and updates the URL via `history.pushState` — no page reload.

### `useRouter` / `nixRouter`

`nixRouter()` is the recommended way to access the router. It resolves the injected router from context first, falling back to the singleton. `useRouter()` remains available as an alias for backward compatibility.

```typescript
class UserDetail extends NixComponent {
  render() {
    const router = nixRouter();
    return html`
      <h1>User: ${() => router.params.value.id}</h1>
      <p>Page: ${() => router.query.value.page ?? "1"}</p>
    `;
  }
}
```

### Nested routes

Define `children` on a route. The parent component renders `new RouterView(1)` to slot in the child:

```typescript
createRouter([
  {
    path: "/dashboard",
    component: () => new DashboardLayout(),
    children: [
      { path: "/stats",    component: () => new StatsPage()    },
      { path: "/settings", component: () => new SettingsPage() },
    ],
  },
]);

class DashboardLayout extends NixComponent {
  render() {
    return html`
      <aside>
        ${new Link("/dashboard/stats",    "Stats")}
        ${new Link("/dashboard/settings", "Settings")}
      </aside>
      <main>${new RouterView(1)}</main>  <!-- renders the child route -->
    `;
  }
}
```

### Query parameters

```typescript
const router = nixRouter();

// Navigate with query params via the options object
router.navigate("/users", { query: { page: 2, sort: "name" } });
// URL: /users?page=2&sort=name

// Or inline in the path string
router.navigate("/users?page=2&sort=name");

// Read them reactively
html`<p>Page: ${() => router.query.value.page}</p>`

// null/undefined removes the key
router.navigate("/users", { query: { page: null } });
// URL: /users
```

---

## Async & Lazy Loading

### `suspend()`

Runs an async function and renders different UIs depending on its state: `pending`, `resolved`, or `error`. The equivalent of `<Suspense>` in other frameworks.

```typescript
import { suspend } from "./nix";

const userView = suspend(
  () => fetch("/api/user").then(r => r.json()),
  (user) => html`<div>${user.name}</div>`
);

mount(userView, "#app");
```

**Options:**

```typescript
suspend(
  asyncFn,
  renderFn,
  {
    // Template shown while pending (default: animated spinner)
    fallback: html`<p>Loading…</p>`,

    // Called with the error if the promise rejects
    errorFallback: (err) => html`<p style="color:red">Error: ${String(err)}</p>`,

    // If true, shows the fallback on every re-fetch.
    // If false (default), keeps the previous content visible during refresh.
    resetOnRefresh: false,

    // Signal that triggers re-fetch when its value changes.
    // DOM is reused — no destroy/recreate cycle.
    invalidate: mySignal,

    // Cache key — when set, resolved data is cached globally.
    // Subsequent mounts with the same key render cached data instantly.
    cacheKey: "user-profile",

    // Time (ms) that cached data is considered fresh.
    // While fresh, no background refetch happens on mount.
    // Only used when `cacheKey` is set. Default: 0.
    staleTime: 60_000,
  }
)
```

#### Re-fetching with `invalidate`

When your data comes from an external source (API, database) and you need to refresh after mutations, pass an `invalidate` signal. When the signal value changes, `suspend()` re-runs `asyncFn` **without destroying and recreating the DOM** — only the reactive content updates.

```typescript
import { signal, html, suspend, mount } from "@deijose/nix-js";
import type { NixTemplate } from "@deijose/nix-js";

const refresh = signal(0);

function UsersPage(): NixTemplate {
  return html`
    <div>
      ${suspend(
        () => fetch("/api/users").then(r => r.json()),
        (users) => html`
          <ul>${users.map((u: any) => html`<li>${u.name}</li>`)}</ul>
        `,
        { invalidate: refresh }
      )}
      <button @click=${async () => {
        await fetch("/api/users", { method: "POST", body: JSON.stringify({ name: "New" }) });
        refresh.update(n => n + 1);  // re-fetch — DOM stays, content updates
      }}>Add user</button>
    </div>
  `;
}
```

**Before `invalidate`** (the old workaround):
```typescript
// ❌ Wrapping suspend() in a reactive block destroys and recreates
// the entire DOM tree on every refresh — loading spinner flashes each time.
${() => {
  refreshKey.value;  // dummy read to force re-create
  return suspend(() => api.getAll(), renderFn);
}}
```

**With `invalidate`:**
```typescript
// ✅ DOM is reused. Only the resolved content updates when data arrives.
${suspend(() => api.getAll(), renderFn, { invalidate: refreshKey })}
```

### `createQuery()` / `invalidateQueries()`

> **Note:** `createQuery` and query cache utilities now live in a separate package:
> ```bash
> npm install @deijose/nix-query
> ```

For apps with multiple components sharing the same data source, **key-based queries** with **built-in caching** eliminate prop drilling entirely. Data is cached globally by key — when a component remounts, cached data renders **instantly** (no loading spinner) while a background refetch runs silently. Similar to React Query / TanStack Query.

```typescript
import { NixComponent, invalidateQueries, html, repeat } from "@deijose/nix-js";
import { createQuery } from "@deijose/nix-query";

class ReservationsTable extends NixComponent {
  private q = createQuery("reservations", () =>
    fetch("/api/reservations").then(r => r.json())
  );

  render() {
    return html`
      <div class="query-container">
        ${() => this.q.status.value === 'pending' && html`<p>Loading...</p>`}
        ${() => this.q.status.value === 'error' && html`<p>Error: ${this.q.error.value}</p>`}
        
        ${() => this.q.status.value === 'success' && html`
          <table>
            ${() => repeat(this.q.data.value, r => r.id, r => html`
              <tr><td>${() => r.title}</td></tr>
            `)}
          </table>
        `}
      </div>
    `;
  }
}

// After a mutation, anywhere in the app
async function confirmLoan(id: number) {
  await fetch(`/api/reservations/${id}/confirm`, { method: "POST" });
  invalidateQueries("reservations");  // clears cache + all active instances re-fetch
}
```

**Caching behavior:**

1. **First mount** — shows fallback (spinner), fetches data, stores in global cache.
2. **Subsequent mounts** (e.g. navigating back) — renders cached data **immediately**, refetches in background.
3. **`invalidateQueries(key)`** — clears cache for that key + forces all active instances to refetch.
4. **Garbage collection** — cache entries with no active subscribers are cleaned up after 5 minutes.

```typescript
// With staleTime — skip background refetch if data is recent
const q1 = createQuery(
  "books",
  () => api.getBooks(),
  { staleTime: 30_000 }  // 30s: no refetch if data is less than 30s old
);

// Never refetch on mount — only invalidateQueries() triggers refresh
const q2 = createQuery(
  "static-config",
  () => api.getConfig(),
  { refetchOnMount: false }
);
```

**When to use which:**

| Scenario | Use |
|----------|-----|
| Single component owns the data + refresh trigger | `suspend()` + `invalidate` |
| Multiple components share the same data source | `createQuery()` + `invalidateQueries()` |
| One-shot data (no refresh needed) | `suspend()` without options |
| Cached data across page navigations | `createQuery()` with `staleTime` |
| Single component with caching | `suspend()` with `cacheKey` |

### `lazy()`

Wraps a dynamic `import()` for code-splitting. The module chunk is loaded once and cached; subsequent renders use the cached constructor directly.

```typescript
import { createRouter, lazy } from "./nix";

createRouter([
  { path: "/",      component: lazy(() => import("./pages/Home"))  },
  { path: "/about", component: lazy(() => import("./pages/About")) },
  {
    path: "/admin",
    component: lazy(
      () => import("./pages/Admin"),
      html`<p>Loading admin panel…</p>` // optional custom fallback
    ),
  },
]);
```

Each page module must export its component as `export default`:

```typescript
// pages/Home.ts
import { NixComponent, html } from "../nix";

export default class HomePage extends NixComponent {
  render() {
    return html`<h1>Home</h1>`;
  }
}
```

For modules that use a named export, pass a selector:

```typescript
const LazyAdmin = lazy(
  () => import("./pages/Admin"),
  {
    selector: (mod) => mod.AdminPage,
    fallback: html`<p>Loading admin panel…</p>`
  }
);
```

---

### Route Guards

Intercept navigation before it commits. Guards run in order: all `beforeEach` guards first, then the route-level `beforeEnter` guard.

| Return value | Effect |
|---|---|
| `void` / `undefined` | Allow navigation |
| `false` | Cancel navigation (URL unchanged, current route unchanged) |
| `string` (path) | Redirect to that path instead |
| `Promise<...>` | Async guard — same return semantics |

#### `router.beforeEach(guard)` — global guard

Called before **every** navigation. Returns an unsubscribe function.

```typescript
import { createRouter } from "@deijose/nix-js";
import type { NavigationGuard } from "@deijose/nix-js";

const router = createRouter([...]);

// Redirect unauthenticated users away from protected routes
const stop = router.beforeEach((to, from) => {
  const protected = ["/dashboard", "/profile", "/settings"];
  if (protected.includes(to) && !isLoggedIn()) {
    return "/login"; // redirect
  }
  // return nothing to allow
});

// Remove the guard later
stop();
```

#### `beforeEnter` — per-route guard

Defined on the route record. Fires only when navigating to that specific route.

```typescript
createRouter([
  { path: "/",     component: () => new HomePage() },
  {
    path: "/admin",
    component: () => new AdminPage(),
    beforeEnter: (to, from) => {
      if (!isAdmin()) return "/"; // only admins allowed
    },
  },
]);
```

#### Async guards

Return a `Promise` to perform async checks (e.g., token validation, API permission check):

```typescript
router.beforeEach(async (to, from) => {
  const ok = await checkTokenValid();
  if (!ok) return "/login";
});
```

When any guard in the chain returns a `Promise`, the remaining guards and the navigation commit are deferred until the promise resolves. Navigation cannot be awaited from the callsite — it completes asynchronously (fire-and-forget).

#### Type

```typescript
type NavigationGuardResult = void | undefined | false | string;

type NavigationGuard = (
  to: string,
  from: string,
) => NavigationGuardResult | Promise<NavigationGuardResult>;
```

---

## Forms

Nix.js includes a built-in form management system inspired by react-hook-form.
It works entirely via signals — no magic, no decorators, and zero extra dependencies.
Validation libraries like Zod, Valibot, or Yup are supported as optional add-ons.

### `useField()`

For managing a **single field** independently:

```typescript
import { useField, required, minLength } from "@deijose/nix-js";

const name = useField("", [required(), minLength(2)]);

// In a template:
html`
  <input
    value=${() => name.value.value}
    @input=${name.onInput}
    @blur=${name.onBlur}
  />
  ${() => name.error.value
    ? html`<p style="color:red">${name.error.value}</p>`
    : null}
`
```

| Property | Type | Description |
|---|---|---|
| `value` | `Signal<T>` | Current value — read/write |
| `error` | `Signal<string\|null>` | Validator error, hidden based on `validateOn` |
| `touched` | `Signal<boolean>` | True after first `blur` |
| `dirty` | `Signal<boolean>` | True after first `input` |
| `onInput` | `(e: Event) => void` | Attach to `@input` |
| `onBlur` | `() => void` | Attach to `@blur` |
| `reset()` | `() => void` | Restore initial state |

#### `validateOn`

Both `useField` and `createForm` accept a `validateOn` option (`blur` | `input` | `submit`):

- **`blur` (default)**: Errors appear only after the input loses focus.
- **`input`**: Errors appear as soon as the user starts typing.
- **`submit`**: Errors are hidden until the first `handleSubmit` call.

```typescript
const name = useField("", [required()], "input");
```

#### Field type coercion

`useField` / `nixField` automatically coerce the DOM value based on the initial type:

- **String**: used as-is (default).
- **Number**: parsed with `Number(value)`. An empty input becomes `NaN` instead of `0` so you can detect cleared fields.
- **Boolean**: checkbox/radio use `checked`; `<select>` and text inputs accept `"true"`, `"false"`, `"1"`, `"0"` or `""`. Unknown values fall back to the initial value.

```typescript
const age = useField(0);       // numeric input
const accept = useField(false); // checkbox or select "true"/"false"
```

### `createForm()`

For managing a **full form** with submit handling:

```typescript
import { createForm, required, email, min } from "@deijose/nix-js";

const form = createForm(
  { name: "", email: "", age: 0 },
  {
    validators: {
      name:  [required(), minLength(2)],
      email: [required(), email()],
      age:   [required(), min(18)],
    },
    validateOn: "blur", // default
  }
);

function onSubmit(values: typeof form.values.value) {
  console.log("Submitted:", values); // only called if valid
}

html`
  <form @submit=${form.handleSubmit(onSubmit)}>
    <input
      value=${() => form.fields.name.value.value}
      @input=${form.fields.name.onInput}
      @blur=${form.fields.name.onBlur}
    />
    ${() => form.fields.name.error.value
      ? html`<p class="err">${form.fields.name.error.value}</p>`
      : null}

    <button type="submit" disabled=${() => form.isSubmitting.value}>
      ${() => form.isSubmitting.value ? "Submitting..." : "Submit"}
    </button>
  </form>
`
```

| Property | Type | Description |
|---|---|---|
| `fields` | `Object` | Map of `FieldState` objects |
| `values` | `Signal<T>` | Reactive read-only snapshot of all values |
| `valid` | `Signal<boolean>` | True if no visible errors exist |
| `dirty` | `Signal<boolean>` | True if any field has been modified |
| `touched` | `Signal<boolean>` | True if any field has lost focus |
| `isSubmitting` | `Signal<boolean>` | True while async `handleSubmit` is running |
| `submitCount` | `Signal<number>` | Number of submit attempts |
| `handleSubmit(fn)` | `Function` | Wraps submit logic with validation |
| `setErrors(map)` | `Function` | Inject external/server errors |
| `reset()` | `Function` | Restore all fields to initial values |
| `dispose()` | `Function` | Cleanup internal computed signals |

`handleSubmit(fn)` automatically:
1. Calls `e.preventDefault()`
2. Increments `submitCount` and forces error visibility
3. Runs `options.validate` if provided
4. Only calls `fn(values)` if all validations pass
5. Manages `isSubmitting` state for async callbacks

### Nested Form Fields (Dot-Path)

`createForm()` supports nested object values using dot-path keys for `fields`, `validators`, and `setErrors`.

```typescript
const form = createForm(
  {
    name: "",
    address: {
      city: "",
      zip: "",
    },
  },
  {
    validators: {
      name: [required()],
      "address.city": [required()],
    },
  },
);

form.fields["address.city"].onBlur();
form.setErrors({ "address.city": "City is required" });

// values keeps nested shape
form.values.value.address.city;
```

### Cross-Field Validation

Validators can receive the full form values as a second argument. This enables password confirmation, date ranges, and conditional required rules.

```typescript
const form = createForm(
  { pass: "", confirm: "" },
  {
    validators: {
      confirm: [
        (value, values) => value !== values?.pass ? "Must match" : null,
      ],
    },
  },
);
```

Validator signature:

```typescript
type Validator<T, AllValues = unknown> = (
  value: T,
  allValues?: AllValues,
) => string | null | undefined;
```

### `useFieldArray()`

For managing dynamic lists of field groups (add, remove, reorder).

```typescript
import { useFieldArray, required } from "@deijose/nix-js";

const items = useFieldArray(
  [{ name: "Item 1" }],
  { name: [required()] }
);

html`
  ${() => repeat(
    items.fields.value,
    (_, i) => i,
    (group, i) => html`
      <div>
        <input value=${() => group.name.value.value} @input=${group.name.onInput} />
        <button @click=${() => items.remove(i)}>Remove</button>
      </div>
    `
  )}
  <button @click=${() => items.append({ name: "" })}>Add Item</button>
`
```

| Method / Prop | Description |
|---|---|
| `fields` | `Signal<FieldGroup[]>` — the reactive list |
| `append(val)` | Add item at the end |
| `remove(idx)` | Remove item by index |
| `move(from, to)`| Reorder items |
| `replace(idx, val)` | Swap item at index |
| `length` | `Signal<number>` — current count |
| `reset()` | Restore initial items |

### Built-in validators

| Validator | Signature | Description |
|---|---|---|
| `required()` | `(msg?)` | Non-empty value |
| `minLength(n)` | `(n, msg?)` | String length ≥ n |
| `maxLength(n)` | `(n, msg?)` | String length ≤ n |
| `email()` | `(msg?)` | Valid email format |
| `pattern(re)` | `(regex, msg?)` | Matches regex |
| `min(n)` | `(n, msg?)` | Number ≥ n |
| `max(n)` | `(n, msg?)` | Number ≤ n |

All validators accept an optional custom message as their last argument.
You can write your own: a validator is just `(value: T) => string | null`.

```typescript
// Custom validator
const noSpaces = (v: string) => /\s/.test(v) ? "No spaces allowed" : null;

const username = useField("", [required(), noSpaces]);
```

### Zod / Valibot interop

Use the `validate` option in `createForm` to plug in any schema library.
The function receives the full form values and returns a field→error map or null.

```typescript
import { z } from "zod";

const schema = z.object({
  name:  z.string().min(2, "Min 2 characters"),
  email: z.string().email("Invalid email"),
});

const form = createForm(
  { name: "", email: "" },
  {
    validate(values) {
      const result = schema.safeParse(values);
      if (result.success) return null;
      return Object.fromEntries(
        Object.entries(result.error.flatten().fieldErrors)
              .map(([k, v]) => [k, v?.[0] ?? null])
      );
    },
  }
);
```

Same pattern works for Valibot, Yup, Arktype, or any custom validator:

```typescript
// Valibot
import { safeParse } from "valibot";

validate(values) {
  const r = safeParse(schema, values);
  if (r.success) return null;
  const errs: Record<string, string> = {};
  for (const issue of r.issues)
    if (issue.path?.[0]?.key)
      errs[String(issue.path[0].key)] = issue.message;
  return errs;
}
```

### Server-side errors

After a failed API call, inject server errors directly into the form fields.
Each field's error disappears automatically when the user edits that field.

```typescript
async function onSubmit(values) {
  const res = await api.register(values);
  if (!res.ok) {
    const { errors } = await res.json();
    // errors: { email: "Email already in use", name: "Name taken" }
    form.setErrors(errors);
    return;
  }
  router.push("/dashboard");
}
```

---

## show / hide directive

Toggle element visibility **without removing the element from the DOM**.
The element stays mounted — its state, event listeners, and child components
are preserved. Only `style.display` changes.

### `show` attribute

The element is **visible** when the value is truthy, **hidden** when falsy.

```typescript
import { signal } from "@deijose/nix-js";

const isOpen = signal(false);

html`
  <button @click=${() => { isOpen.value = !isOpen.value; }}>
    Toggle
  </button>

  <div show=${() => isOpen.value}>
    This panel is shown/hidden without being destroyed.
  </div>
`
```

### `hide` attribute

The inverse of `show` — the element is **hidden** when the value is truthy.

```typescript
const loading = signal(false);

html`
  <form hide=${() => loading.value}>...</form>
  <div show=${() => loading.value}>⏳ Submitting…</div>
`
```

Both attributes accept static values too:

```typescript
html`<div show=${false}>Never visible</div>`
html`<div hide=${true}>Also never visible</div>`
```

### `showWhen()`

Imperative helper for controlling visibility outside of a template:

```typescript
import { showWhen, effect } from "@deijose/nix-js";

const panel = document.getElementById("panel") as HTMLElement;

// One-time:
showWhen(panel, false); // sets display:none
showWhen(panel, true);  // restores display

// Reactively:
const visible = signal(true);
effect(() => showWhen(panel, visible.value));
```

### show vs conditional rendering

| | `show` / `hide` | Conditional (`() => cond ? html\`…\` : null`) |
|---|---|---|
| DOM node kept | ✅ always | ❌ destroyed when hidden |
| Child state preserved | ✅ | ❌ reset on re-mount |
| Event listeners | ✅ kept | ❌ re-attached on re-mount |
| Lifecycle hooks (`onMount`) | not called on toggle | called every toggle |
| Ideal for | frequent show/hide | mutually exclusive branches |

---

## Portal

Render a template or component **outside of the current DOM tree** — typically
into `document.body`. Portals are essential for modals, tooltips, dropdowns, and
toast notifications that must not be clipped by `overflow: hidden` or buried by
stacking contexts.

The portal returns a `NixTemplate`, so it integrates naturally as a node value
in any template, including inside reactive conditionals. Cleanup is automatic:
when the parent template unmounts, the portal content is removed too.

### Basic usage

```typescript
import { portal, html } from "@deijose/nix-js";

// Render into document.body (default target)
portal(html`<div class="modal">...</div>`)

// Render into a specific element
portal(html`<div class="toast">Saved!</div>`, document.getElementById("toasts")!)

// Use a CSS selector as target
portal(html`<nav>...</nav>`, "#sidebar")
```

### Reactive portal

The portal is mounted and unmounted together with its controlling condition:

```typescript
import { signal, portal, html } from "@deijose/nix-js";

const isOpen = signal(false);

html`
  <button @click=${() => { isOpen.value = true; }}>Open modal</button>

  ${() => isOpen.value
    ? portal(html`
        <div class="overlay" @click=${() => { isOpen.value = false; }}>
          <div class="modal" @click.stop=${() => {}}>
            <h2>Modal title</h2>
            <button @click=${() => { isOpen.value = false; }}>Close</button>
          </div>
        </div>
      `)
    : null
  }
`
```

### Custom target

```typescript
const sidebarRoot = document.getElementById("sidebar-root")!;

html`
  ${() => drawerOpen.value
    ? portal(html`<aside class="drawer">...</aside>`, sidebarRoot)
    : null
  }
`

class MyModal extends NixComponent {
  render() {
    return html`<div class="modal-inner">...</div>`;
  }
}

html`${() => showModal.value ? portal(new MyModal()) : null}`
```

---

## Portal Ergonomics

Passing raw DOM elements or CSS selectors to `portal()` works, but couples
your component logic to the DOM structure. Nix provides three cleaner alternatives.

### Option A: Outlet token

```typescript
import { createPortalOutlet, portalOutlet, portal, html, mount } from "@deijose/nix-js";

const modalOutlet = createPortalOutlet();

mount(html`
  <div class="app">
    <main>${mainContent}</main>
    ${portalOutlet(modalOutlet)}
  </div>
`, document.body);

html`${() => isOpen.value ? portal(html`<Modal />`, modalOutlet) : null}`
```

### Option B: Ref as target

```typescript
import { ref, portal, html } from "@deijose/nix-js";

const toastRoot = ref<HTMLElement>();

html`
  <div ref=${toastRoot} id="toast-container"></div>

  ${() => hasToast.value
    ? portal(html`<div class="toast">${() => message.value}</div>`, toastRoot)
    : null
  }
`
```

### Option C: Provide / inject

```typescript
import {
  createPortalOutlet, portalOutlet,
  provideOutlet, injectOutlet,
  portal, html, signal, NixComponent
} from "@deijose/nix-js";

class AppLayout extends NixComponent {
  private outlet = createPortalOutlet();
  onInit() { provideOutlet(this.outlet); }
  render() {
    return html`
      <main>${children}</main>
      ${portalOutlet(this.outlet)}
    `;
  }
}

class DeepButton extends NixComponent {
  private outlet: PortalOutlet | undefined;
  private open = signal(false);
  onInit() { this.outlet = injectOutlet(); }
  render() {
    return html`
      <button @click=${() => { this.open.value = true; }}>Open</button>
      ${() => this.open.value
        ? portal(html`<div class="modal">...</div>`, this.outlet)
        : null
      }
    `;
  }
}
```

| | `portal(el)` | Option A (outlet) | Option B (ref) | Option C (inject) |
|---|---|---|---|---|
| Requires DOM access | DOM element | ❌ no | ❌ no | ❌ no |
| CSS selector | optional | ❌ no | ❌ no | ❌ no |
| Works deeply nested | ✅ | ✅ | ✅ | ✅ best |
| Typed outlet | — | ✅ | ✅ | ✅ |
| Needs prop passing | — | optionally | optionally | ❌ never |

---

## Error Boundaries

An error boundary wraps a subtree and catches errors thrown during rendering or
reactive updates. When an error is caught, the broken subtree is torn down and a
fallback UI is rendered in its place — without crashing the rest of the application.

### Basic usage

```typescript
import { createErrorBoundary, html, mount } from "@deijose/nix-js";

mount(
  createErrorBoundary(
    html`<div>${() => riskyComputation()}</div>`,
    (err) => html`<div class="error">Failed: ${String(err)}</div>`
  ),
  "#app"
);
```

The fallback can also be a static template or component:

```typescript
// Static fallback (no error info)
createErrorBoundary(
  new DataTable(),
  html`<p>Table failed to load. Please refresh.</p>`
)

// Fallback receives the error object
createErrorBoundary(
  new DataTable(),
  (err) => html`<pre>${err instanceof Error ? err.message : String(err)}</pre>`
)
```

### NixComponent content

```typescript
class DataWidget extends NixComponent {
  onInit() {
    if (!backendAvailable) throw new Error("Backend offline");
  }
  render() {
    return html`...`;
  }
}

createErrorBoundary(
  new DataWidget(),
  html`<p class="offline">Service unavailable</p>`
)
```

### Reactive errors

```typescript
const isAdmin = signal(false);

createErrorBoundary(
  html`
    <div>${() => {
      if (!isAdmin.value) throw new Error("Access denied");
      return html`<AdminPanel />`;
    }}</div>
  `,
  (err) => html`<div class="denied">403 — ${(err as Error).message}</div>`
)
```

### Nested boundaries

```typescript
createErrorBoundary(
  html`
    <header>...</header>
    ${createErrorBoundary(
      new RiskyWidget(),
      html`<p>Widget failed</p>`
    )}
  `,
  html`<p>App-level error</p>`
)
```

### What is and isn't caught

| Scenario | Caught |
|---|---|
| Template expression throws during initial render | ✅ |
| `onInit()` throws | ✅ |
| `render()` throws | ✅ |
| `onMount()` throws | ✅ |
| Reactive effect throws after mount | ✅ |
| Event handler throws | ❌ (use try/catch in the handler) |
| `async` / `await` / Promises | ❌ (use try/catch with signals) |
| Errors inside the `fallback` itself | ❌ (propagate to parent boundary) |

---

## Transitions

`transition(content, options?)` wraps any template or reactive conditional with
CSS class-based enter / leave animations — no extra DOM wrappers, no JavaScript
animation logic in your code.

### Basic enter/leave transition

```css
/* Fade */
.fade-enter-active,
.fade-leave-active  { transition: opacity 0.3s ease; }
.fade-enter-from,
.fade-leave-to      { opacity: 0; }
```

```typescript
import { signal, html, transition, mount } from "@deijose/nix-js";

const show = signal(true);

mount(
  transition(
    () => show.value ? html`<p>Hello, world!</p>` : null,
    { name: "fade" }
  ),
  "#app"
);
```

**Class lifecycle:**

| Phase  | Step 1 (before rAF)               | Step 2 (after rAF)                | Step 3 (after transition end) |
|--------|-----------------------------------|------------------------------------|--------------------------------|
| Enter  | `{n}-enter-from {n}-enter-active` | `{n}-enter-to {n}-enter-active`   | — (all removed)                |
| Leave  | `{n}-leave-from {n}-leave-active` | `{n}-leave-to {n}-leave-active`   | — (all removed, DOM cleaned up)|

### appear — transition on first render

```typescript
transition(
  html`<div class="banner">Welcome!</div>`,
  { name: "fade", appear: true }
);
```

### Custom class names

```typescript
transition(content, {
  enterFrom:   "my-enter-start",
  enterActive: "my-enter-running",
  enterTo:     "my-enter-end",
  leaveFrom:   "my-leave-start",
  leaveActive: "my-leave-running",
  leaveTo:     "my-leave-end",
});
```

### JS hooks

```typescript
transition(content, {
  name: "fade",
  onBeforeEnter: (el) => console.log("about to enter", el),
  onAfterEnter:  (el) => el.focus(),
  onBeforeLeave: (el) => console.log("about to leave", el),
  onAfterLeave:  (el) => console.log("left", el),
});
```

### TransitionOptions reference

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `name` | `string` | `"nix"` | Prefix for all generated CSS classes |
| `enterFrom` | `string` | `"{name}-enter-from"` | Override enter-from class |
| `enterActive` | `string` | `"{name}-enter-active"` | Override enter-active class |
| `enterTo` | `string` | `"{name}-enter-to"` | Override enter-to class |
| `leaveFrom` | `string` | `"{name}-leave-from"` | Override leave-from class |
| `leaveActive` | `string` | `"{name}-leave-active"` | Override leave-active class |
| `leaveTo` | `string` | `"{name}-leave-to"` | Override leave-to class |
| `appear` | `boolean` | `false` | Play enter transition on first render |
| `duration` | `number` | — | Fallback duration (ms) when no CSS transition found |
| `onBeforeEnter` | `(el) => void` | — | Called before enter classes are added |
| `onAfterEnter` | `(el) => void` | — | Called after enter transition completes |
| `onBeforeLeave` | `(el) => void` | — | Called before leave classes are added |
| `onAfterLeave` | `(el) => void` | — | Called after leave transition completes and DOM removed |

---

## API Reference

### Reactivity

| Function | Signature | Description |
|----------|-----------|-------------|
| `signal` | `<T>(initial: T) → Signal<T>` | Create a reactive value |
| `computed` | `<T>(fn: () => T, equals?: (a: T, b: T) => boolean) → Signal<T>` | Derived reactive value with optional custom equality |
| `effect` | `(fn: () => void\|cleanup) → dispose` | Run and re-run on signal changes |
| `batch` | `(fn: () => void) → void` | Flush multiple writes as one update |
| `watch` | `(source, cb, opts?) → dispose` | Observe a source, receive old+new values |
| `untrack` | `<T>(fn: () => T) → T` | Read signals without subscribing |
| `nextTick` | `(fn?: () => void) → Promise<void>` | Await next microtask (post-DOM-update) |

### Signal methods

| Method | Description |
|--------|-------------|
| `.value` (get) | Read value and subscribe if inside an effect |
| `.value` (set) | Write and notify if changed |
| `.update(fn)` | Write via `fn(current) → next` |
| `.peek()` | Read without subscribing |
| `.dispose()` | Clear all subscribers |

### Templates

| Export | Description |
|--------|-------------|
| `html\`\`` | Tagged template → `NixTemplate` |
| `repeat(items, keyFn, renderFn)` | Keyed list with efficient diffing |
| `ref<T>()` | Create a `NixRef<T>` for direct DOM access |

### Components

| Export | Description |
|--------|-------------|
| `NixTemplate` | Interface returned by `html\`\`` — the building block for function components and pages |
| `NixComponent` | Abstract base class — use when lifecycle hooks are needed (`onInit`, `onMount`, `onUnmount`, `onError`) |
| `mount(component, container, opts?)` | Mount a `NixTemplate` or `NixComponent` → `{ unmount() }`. Accepts `{ router }` option. |

### Dependency Injection

| Export | Description |
|--------|-------------|
| `createInjectionKey<T>(desc?)` | Create a typed, unique injection key |
| `provide(key, value)` | Register a value (call in `onInit`) |
| `inject(key)` | Retrieve the nearest provided value |
| `InjectionKey<T>` | Type for typed injection keys |

### Stores

| Export | Description |
|--------|-------------|
| `createStore(state, options?)` | Create a reactive global store (`options`: `{ name?, actions?, getters?, plugins? }`) |
| `Store<T, A>` | Type of the returned store. Includes `$id`, `$state`, `$stateSignal`, `$patch`, `$reset`, `$watch`, `$dispose`. |
| `StoreSignals<T>` | Signal-mapped type of a state shape |
| `NixPlugin<T>` | Plugin function type |

### Router

| Export | Description |
|--------|-------------|
| `createRouter(routes, opts?)` | Initialize the router. Accepts `mode`, `scrollBehavior`. |
| `nixRouter()` | Access the active router (context-injected or singleton) |
| `useRouter()` | Alias for `nixRouter()` — backward compatible |
| `RouterView` | Component that renders the matched route at a given depth |
| `Link` | Reactive anchor component with active styling |
| `RouterKey` | Injection key for the router |
| `Router` | Router instance interface |
| `RouteRecord` | Route definition type (includes `name`, `meta`, `beforeEnter`, `children`) |
| `NavigationGuard` | Guard function type |
| `AfterEachHook` | Post-navigation hook type |
| `ResolvedRoute` | Return type of `router.resolve()` |

### Async

| Export | Description |
|--------|-------------|
| `suspend(asyncFn, renderFn, opts?)` | Async data fetching with Suspense. Supports `invalidate`, `cacheKey`, `staleTime` |
| `lazy(importFn, fallback?)` | Dynamic import with caching |
| `SuspenseOptions` | Options type for `suspend()` |

> `createQuery`, `invalidateQueries`, `clearQueryCache`, `setQueryCacheTime` are available from `@deijose/nix-query`.

### Forms

| Export | Description |
|--------|-------------|
| `useField(initial, vs?, mode?)` | Manage a single form field |
| `createForm(state, opts?)` | Manage a full form (supports dot-path nested fields and cross-field validators) |
| `useFieldArray(items, vs?, mode?)` | Manage dynamic lists of fields |
| `required(msg?)` | Non-empty value validator |
| `minLength(n, msg?)` | Minimum string length validator |
| `maxLength(n, msg?)` | Maximum string length validator |
| `email(msg?)` | Email format validator |
| `pattern(regex, msg?)` | Regex match validator |
| `min(n, msg?)` | Minimum number validator |
| `max(n, msg?)` | Maximum number validator |
| `extendValidators(map)` | Register custom named validators |
| `createValidator(name, fn)` | Create a reusable named validator |

### show / hide

| Export | Description |
|--------|-------------|
| `show` attribute | Show element when truthy (via `style.display`) |
| `hide` attribute | Hide element when truthy (via `style.display`) |
| `showWhen(el, condition)` | Imperative show/hide helper |

### Portal

| Export | Description |
|--------|-------------|
| `portal(content, target?)` | Render content outside the current DOM tree |
| `createPortalOutlet()` | Create a typed anchor token |
| `portalOutlet(outlet)` | Place an outlet anchor in the DOM |
| `provideOutlet(outlet)` | Provide an outlet via DI to descendants |
| `injectOutlet()` | Inject the nearest provided outlet |
| `PortalOutlet` | Outlet token type |

### Error Boundaries

| Export | Description |
|--------|-------------|
| `createErrorBoundary(content, fallback)` | Wrap content with an error-catching boundary |
| `ErrorFallback` | Fallback type: template or `(err) => template` |

### Transitions

| Export | Description |
|--------|-------------|
| `transition(content, options?)` | Wrap content with CSS enter/leave animations |
| `TransitionOptions` | Configuration type for `transition()` |

---

## What's Included

Everything ships in a single zero-dependency import:

| Category | APIs |
|---|---|
| **Reactivity** | `signal`, `computed`, `effect`, `batch`, `watch`, `untrack`, `nextTick` |
| **Templates** | `` html` ` ``, `repeat`, `ref`, `portal`, `transition`, `showWhen` |
| **Components** | `NixTemplate` (function components), `NixComponent` (lifecycle class), `mount`, children & named slots |
| **Router** | `createRouter` (meta + scrollBehavior + mode + named routes), `RouterView`, `Link`, `nixRouter`, `RouterKey`, guards, nested routes, `mount(..., { router })` |
| **Forms** | `nixField`, `createForm` (nested dot-path fields, cross-field validators), built-in validators, Zod/Valibot interop |
| **State** | `createStore` (plugins + batching + `$watch` + `$dispose`), `provide`, `inject`, `createInjectionKey` |
| **Async** | `suspend` (with `invalidate` for re-fetching), `lazy` |
| **Error handling** | `createErrorBoundary` |

> **Query Package:** `createQuery` and query cache utilities live in `@deijose/nix-query`.
> ```bash
> npm install @deijose/nix-query
> ```

---

## Comparison with Other Frameworks

### Runtime & Architecture

| | Nix.js | React 19 | Vue 3 | Solid.js | Svelte 5 |
|---|---|---|---|---|---|
| **Reactivity** | Signals | State + VDOM diff | Refs + VDOM diff | Signals | Runes (signals) |
| **Virtual DOM** | No | Yes | Yes | No | No |
| **Compiler required** | No | JSX transform | SFC compiler | JSX transform | Svelte compiler |
| **Template system** | Tagged templates | JSX | SFC / JSX | JSX | Svelte syntax |
| **Min + gzip** | ~14 KB | ~45 KB | ~33 KB | ~10 KB | ~18 KB |
| **TypeScript-first** | Native | Via JSX types | Via SFC tooling | Native | Via compiler |

### Built-in Features

| Feature | Nix.js | React | Vue | Solid | Svelte |
|---|---|---|---|---|---|
| Router | Built-in | react-router | vue-router | @solidjs/router | svelte-kit |
| Form validation | Built-in | react-hook-form | vee-validate | — | — |
| Global stores | Built-in | zustand / redux | pinia | built-in | svelte/store |
| Dependency injection | Built-in | React Context | provide/inject | createContext | getContext |
| Portals | Built-in | createPortal | Teleport | Portal | — |
| Error boundaries | Built-in | ErrorBoundary | errorHandler | ErrorBoundary | — |
| Transitions | Built-in | — | Transition | — | transition: |

**When to choose Nix.js:**
- You want a single-import framework with routing, forms, stores, and DI built in
- You prefer tagged templates over JSX or SFC compilers
- You want fine-grained reactivity without a virtual DOM
- You need a lightweight solution for small-to-medium apps or embedded widgets

---

## Known Limitations

**Partial attribute interpolation is not supported.**

Each dynamic attribute must be a single interpolation covering the entire attribute value. Mixing static text and expressions inside one attribute value does not work:

```typescript
// ✅ Works — the whole value is one expression
html`<div class=${() => `item ${isActive.value ? "active" : ""}`}>`

// ❌ Does NOT work — static prefix + dynamic suffix in same attribute
html`<div class="item ${() => isActive.value ? 'active' : ''}">`
```

Workaround: compute the full string outside the template and bind the result.

---

## DevTools

Enable the in-app devtools panel for signal and router inspection:

```typescript
import { enableDevTools } from "@deijose/nix-js/devtools";

const { disable } = enableDevTools({
    initiallyOpen: true,
    position: "bottom-right",
    refreshMs: 350,
    historyLimit: 50,
});
```

- `initiallyOpen` — open the panel immediately.
- `position` — `"bottom-right"` or `"bottom-left"`.
- `refreshMs` — UI refresh interval in milliseconds.
- `historyLimit` — maximum number of entries kept per signal history (default `50`).

Routers injected via `mount(component, host, { router })` are automatically visible in the Router tab. The panel reuses a single overlay instance, so calling `enableDevTools()` multiple times is safe.

---

## Contributing

Contributions are welcome. Please follow these guidelines:

1. **Fork** the repository and create a feature branch from `main`.
2. **Install dependencies:** `npm install`
3. **Run tests** before submitting: `npx vitest run` (all tests must pass).
4. **Follow existing code style** — no linter overrides, no unnecessary abstractions.
5. **One concern per PR** — bug fixes, features, and refactors should be separate.
6. **Write tests** for new functionality.

```bash
# Development workflow
npm install
npm run dev          # start dev server
npx vitest           # run tests in watch mode
npx vitest run       # run tests once
npx tsc --noEmit     # type-check
npm run build:lib    # production build
```

---

## License

[MIT](https://opensource.org/licenses/MIT) — see [LICENSE](LICENSE) for details.