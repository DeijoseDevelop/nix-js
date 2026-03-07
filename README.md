# ❄️ Nix.js

> A lightweight, fully reactive micro-framework for building modern web UIs — no virtual DOM, no compiler, no build-time magic. Just signals, tagged templates, and pure TypeScript.

```
~28 KB source · zero dependencies · TypeScript-first · ES2022
```

---

## Table of Contents

- [Overview](#overview)
- [Installation & Setup](#installation--setup)
- [Core Concepts](#core-concepts)
- [Reactivity](#reactivity)
  - [signal](#signal)
  - [computed](#computed)
  - [effect](#effect)
  - [batch](#batch)
  - [watch](#watch)
  - [untrack](#untrack)
  - [nextTick](#nexttick)
- [Templates](#templates)
  - [html tag](#html-tag)
  - [Text bindings](#text-bindings)
  - [Attribute bindings](#attribute-bindings)
  - [Event bindings & modifiers](#event-bindings--modifiers)
  - [Conditional rendering](#conditional-rendering)
  - [List rendering](#list-rendering)
  - [Keyed lists: repeat()](#keyed-lists-repeat)
  - [DOM refs: ref()](#dom-refs-ref)
- [Components](#components)
  - [Function components](#function-components)
  - [Class components: NixComponent](#class-components-nixcomponent)
  - [Lifecycle hooks](#lifecycle-hooks)
  - [mount()](#mount)
- [Dependency Injection](#dependency-injection)
  - [provide / inject](#provide--inject)
  - [createInjectionKey](#createinjectionkey)
- [Global Stores](#global-stores)
  - [createStore](#createstore)
- [Router](#router)
  - [createRouter](#createrouter)
  - [RouterView](#routerview)
  - [Link](#link)
  - [useRouter](#userouter)
  - [Nested routes](#nested-routes)
  - [Query parameters](#query-parameters)
- [Async & Lazy Loading](#async--lazy-loading)
  - [suspend()](#suspend)
  - [lazy()](#lazy)
- [API Reference](#api-reference)
- [Known Limitations](#known-limitations)

---

## Overview

Nix.js is a signal-based reactive micro-framework. Its design goals are:

- **No virtual DOM.** Bindings update individual DOM nodes directly via `effect()`.
- **No compiler.** Templates are standard JavaScript tagged template literals.
- **Fine-grained reactivity.** Only the exact text nodes and attributes that depend on a changed signal are updated — no diffing of full component trees.
- **Zero runtime dependencies.** The entire framework is ~28 KB of TypeScript source with no `node_modules` at runtime.
- **TypeScript-first.** Every public API is fully typed, including typed injection keys and typed store signals.

### Architecture at a glance

```
signal() ──── effect() ──────────────────────────────────┐
                │                                         │
              html``                                      │
                │               ┌─ text node              │
                └── binding ────┤─ attribute  (reactive) ─┘
                                └─ child node
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
    async.ts        — suspend(), lazy()
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

The simplest form: a plain function that returns a `NixTemplate`. Signals inside close over the component's scope.

```typescript
import { html, signal, mount } from "./nix";

function Counter() {
  const count = signal(0);
  return html`
    <div>
      <p>${() => count.value}</p>
      <button @click=${() => count.value++}>+</button>
    </div>
  `;
}

mount(Counter(), "#app");
```

### Class components: `NixComponent`

For components that need lifecycle hooks, extend `NixComponent`:

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

  // ⑤ Catches errors thrown inside onInit() and onMount().
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

// Unmount later
handle.unmount(); // runs onUnmount, disposes all effects, removes DOM
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

Creates a reactive global store. Every property of the initial state becomes a `Signal`. An optional factory function adds typed actions.

```typescript
import { createStore } from "./nix";

// Basic store — no actions
const theme = createStore({ dark: true, fontSize: 16 });

theme.dark.value = false;           // write
theme.fontSize.value;               // read
theme.$reset();                     // restore all signals to initial values
```

**With actions:**

```typescript
const cart = createStore(
  {
    items: [] as string[],
    total: 0,
  },
  (s) => ({
    add:    (item: string) => s.items.update(arr => [...arr, item]),
    remove: (item: string) => s.items.update(arr => arr.filter(i => i !== item)),
    clear:  ()             => cart.$reset(),
  })
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

// Store<T, A> — signals + actions + $reset
type Store<T, A> = StoreSignals<T> & A & { $reset(): void };
```

---

## Router

A client-side History API router with dynamic parameters, query strings, nested routes, and reactive active-link styling.

### `createRouter`

Call once at app startup. Sets up the router singleton consumed by `RouterView`, `Link`, and `useRouter`.

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

| Property | Type | Description |
|----------|------|-------------|
| `current` | `Signal<string>` | Active pathname (`/users/42`) |
| `params` | `Signal<Record<string, string>>` | Dynamic route params (`{ id: "42" }`) |
| `query` | `Signal<Record<string, string>>` | Query string params (`{ page: "2" }`) |
| `navigate(path, query?)` | `void` | Navigate programmatically |
| `routes` | `RouteRecord[]` | Original route tree |

### `RouterView`

A `NixComponent` that renders the matched component for a given depth level. Use `new RouterView()` for the root, `new RouterView(1)` for nested child routes.

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
```

### `Link`

A reactive `<a>` tag that automatically applies active/inactive styles based on the current route.

```typescript
new Link("/about", "About Us")
// <a href="/about" style="...active/inactive styles...">About Us</a>
```

Clicking a `Link` calls `router.navigate()` and updates the URL via `history.pushState` — no page reload.

### `useRouter`

Access the router singleton from anywhere — useful inside `NixComponent.render()`:

```typescript
class UserDetail extends NixComponent {
  render() {
    const router = useRouter();
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
      { path: "/stats",   component: () => new StatsPage()   },
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
const router = useRouter();

// Navigate with query params as an object
router.navigate("/users", { page: 2, sort: "name" });
// URL: /users?page=2&sort=name

// Or inline in the path string
router.navigate("/users?page=2&sort=name");

// Read them reactively
html`<p>Page: ${() => router.query.value.page}</p>`

// null/undefined removes the key
router.navigate("/users", { page: null });
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
  }
)
```

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

---

## API Reference

### Reactivity

| Function | Signature | Description |
|----------|-----------|-------------|
| `signal` | `<T>(initial: T) → Signal<T>` | Create a reactive value |
| `computed` | `<T>(fn: () => T) → Signal<T>` | Derived reactive value |
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
| `NixComponent` | Abstract base class with lifecycle hooks |
| `mount(component, container)` | Mount template or component → `{ unmount() }` |

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
| `createStore(state, actions?)` | Create a reactive global store |
| `Store<T, A>` | Type of the returned store |
| `StoreSignals<T>` | Signal-mapped type of a state shape |

### Router

| Export | Description |
|--------|-------------|
| `createRouter(routes)` | Initialize the router singleton |
| `useRouter()` | Access the active router from anywhere |
| `RouterView` | Component that renders the matched route |
| `Link` | Reactive anchor component |
| `Router` | Router instance interface |
| `RouteRecord` | Route definition type |

### Async

| Export | Description |
|--------|-------------|
| `suspend(asyncFn, renderFn, opts?)` | Async data fetching with Suspense |
| `lazy(importFn, fallback?)` | Dynamic import with caching |
| `SuspenseOptions` | Options type for `suspend()` |

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

## License

MIT
