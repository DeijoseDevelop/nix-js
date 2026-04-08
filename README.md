# Nix.js

[![npm version](https://img.shields.io/npm/v/@deijose/nix-js.svg)](https://www.npmjs.com/package/@deijose/nix-js)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Tests](https://img.shields.io/badge/tests-484%20passing-brightgreen.svg)]()
[![Coverage](https://img.shields.io/badge/coverage-95.86%25-brightgreen.svg)]()
[![Bundle size](https://img.shields.io/badge/min%2Bgzip-~10%20KB-orange.svg)]()
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)]()
[![Website](https://img.shields.io/badge/website-nix--js-indigo.svg)](https://nix-js.dev/)

A lightweight, fully reactive micro-framework for building modern web UIs — no virtual DOM, no compiler, no build-time magic. Just signals, tagged templates, and pure TypeScript.

**[→ Documentation & Live Demo](https://nix-js.dev/)**

```
~24 KB minified · ~10 KB gzipped · zero dependencies · TypeScript-first · ES2022
```

## Installation

```bash
npm install @deijose/nix-js
```

## Quick Start

```typescript
import { signal, html, NixTemplate, NixComponent, mount, createRouter, RouterView, Link, useRouter } from "@deijose/nix-js";

// --- Pages as function components (NixTemplate) ---
// Plain functions returning html`` are recommended for pages and
// display-only components — no class needed, signals just work.

function HomePage(): NixTemplate {
  const count = signal(0);
  return html`
    <h1>Home</h1>
    <p>Count: ${() => count.value}</p>
    <button @click=${() => count.value++}>+1</button>
  `;
}

function UserPage(): NixTemplate {
  const router = useRouter();
  return html`<h1>User: ${() => router.params.value.id}</h1>`;
}

// --- Stateful component as class component (NixComponent) ---
// Use a class when you need lifecycle hooks: onInit / onMount / onUnmount.

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

createRouter([
  { path: "/",         component: () => HomePage() },
  { path: "/user/:id", component: () => UserPage() },
]);

// --- App shell (function component) ---

function App(): NixTemplate {
  return html`
    <nav>${new Link("/", "Home")} ${new Link("/user/42", "User 42")}</nav>
    ${new Clock()}
    ${new RouterView()}
  `;
}

mount(App(), "#app");
```

## Route Metadata (meta)

Route records now support an optional `meta` object. The matched route metadata is exposed through `router.resolve(path)`.

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

## Router Scroll Restoration

The router saves scroll positions in `history.state`, restores them on back/forward, and supports a custom `scrollBehavior` callback.

```typescript
createRouter(routes, {
  scrollBehavior(to, from, saved) {
    if (saved) return saved; // back/forward
    return { left: 0, top: 0 }; // new navigation
  },
});
```

## Router Hash Mode

Use hash mode when your server cannot rewrite route URLs to index.html.

```typescript
createRouter(routes, {
  mode: "hash", // default: "history"
});
```

In hash mode, URLs look like `#/users/42` and navigation is driven by `hashchange`.

## Advanced Store Patterns

`createStore` accepts optional actions (second argument) and optional computed getters (third argument).

```typescript
const store = createStore(
  { count: 0, items: [] as string[] },
  (s) => ({
    increment: () => s.count.value++,
    addItem: (name: string) => (s.items.value = [...s.items.value, name]),
  }),
  (s) => ({
    double: computed(() => s.count.value * 2),
    total: computed(() => s.items.value.length),
  }),
);

store.increment();
store.double.value; // 2
```

Use `store.$subscribe()` for middleware patterns (persist/devtools/logging). It watches all state keys and returns an unsubscribe function.

```typescript
const unsubscribe = store.$subscribe((key, newVal, oldVal) => {
  localStorage.setItem("store", JSON.stringify(store.$state));
});

// later
unsubscribe();
```

## Nested Form Fields (Dot-Path)

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

## Cross-Field Validation

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

## What's Included

Everything ships in a single zero-dependency import:

| Category | APIs |
|---|---|
| **Reactivity** | `signal`, `computed`, `effect`, `batch`, `watch`, `untrack`, `nextTick` |
| **Templates** | `` html` ` ``, `repeat`, `ref`, `portal`, `transition`, `showWhen` |
| **Components** | `NixTemplate` (function components), `NixComponent` (lifecycle class), `mount`, children & named slots |
| **Router** | `createRouter` (meta + scrollBehavior + mode), `RouterView`, `Link`, `useRouter`, guards, nested routes |
| **Forms** | `useField`, `createForm` (including nested dot-path fields), built-in validators, Zod/Valibot interop |
| **State** | `createStore` (actions + getters), `$subscribe`, `provide`, `inject`, `createInjectionKey` |
| **Async** | `suspend` (with `invalidate` for re-fetching), `createQuery`, `invalidateQueries`, `lazy` |
| **Error handling** | `createErrorBoundary` |

## Documentation

Full API reference, guides, and examples:

**→ [github.com/DeijoseDevelop/nix-js](https://github.com/DeijoseDevelop/nix-js)**

## License

MIT
