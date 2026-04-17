# Changelog

All notable changes to this project will be documented in this file.

## v2.2.0

- **feat(store)!: reactive plugin system with lifecycle support** — added `NixPlugin` architecture enabling decoupled middleware like persistence, devtools, and sync. Plugins can return a cleanup function called on store disposal.
- **feat(store)!: new `$watch`, `$id`, and `$dispose` APIs** — replaced `$subscribe` with `$watch` (using core reactivity) and added store identification and resource cleanup mechanisms.
- **feat(store): atomic state updates via `batch()`** — `$reset` and `$patch` are now internally batched to prevent unnecessary reactive cycles and improve performance.
- **feat(store): raw state signal accessibility** — exposed `$stateSignal` (computed) so power users and plugins can derive custom reactive graphs from the store root.
- **fix(store): prototype pollution hardening** — hardened `assertKey` to explicitly block `__proto__`, `constructor`, and `prototype` keys.
- **fix(store): robust state serialization validation** — `initialState` is now verified with `structuredClone` (with descriptive error messages) to ensure state remains pure and serializable.
- **fix(store): read-only signal enforcement** — enhanced `makeReadonly` for getters and `$stateSignal` to provide descriptive errors on mutation or invalid disposal attempts.
- **fix(store): safe property reflection** — `$patch` now uses `Object.prototype.hasOwnProperty` for safer key detection, avoiding prototype chain leakage.
- **fix(store): strict getter type validation** — added `instanceof Signal` checks with `TypeError` reporting for getter factory outputs.

## v2.1.0

- **refactor(api)!: `use*` prefix renamed to `nix*` across the framework** — composables/hooks and related API names now use the `nix` prefix for consistency with package naming.
- **docs(api)!: updated examples and guides to the new `nix*` naming** — all public snippets were aligned to the breaking rename.
- **breaking**: projects using previous `use*` APIs must migrate imports and call sites to their `nix*` equivalents.

## v2.0.2

- **fix(devtools): components tab route-aware refresh** — components panel now invalidates/re-renders on route changes (`current` / `matched`) so navigation updates are reflected in real time even when page views are template-based.
- **ux(devtools): route context in components panel** — added visible `current` and `matched` route metadata to clarify page transitions when mounted class-component tree remains stable.
- **test(devtools): route-navigation regression** — added coverage to ensure components panel updates after `router.navigate()`.

## v2.0.1

- **fix(devtools): tab/content synchronization** — fixed stale panel rendering when switching tabs quickly; active tab button state and rendered panel content now stay in sync.
- **fix(devtools): component panel live refresh** — component rows now refresh using live instance references (debug name, slots, props), so component state changes are reflected without requiring remount.
- **fix(devtools): recursive unmount cleanup** — unmount now removes full tracked component subtrees to prevent stale entries in the component panel.
- **test(devtools): regression coverage for tab and component refresh behavior** — added tests for tab switching desync and component prop updates in the inspector.

## v2.0.0

- **feat(devtools): in-page overlay inspector** — added optional `@deijose/nix-js/devtools` entry with `enableDevTools()` / `disableDevTools()` and three panels (signals, component tree, router state).
- **feat(debug): component identity tracking hooks** — added internal component mount/unmount tracking with `_debugName` support for richer devtools trees.
- **feat(debug): signal metadata snapshots** — added internal signal registry snapshots with subscriber counts, last updated timestamp, and bounded history.
- **feat(debug): router snapshot API** — added internal router debug snapshots including current path, params/query, matched route chain, and active guards.
- **fix(reactivity): shared global runtime state across duplicated module instances** — moved reactive engine state to `globalThis` (`Symbol.for("@deijose/nix-js/reactivity-state")`) so effects/signals interoperate correctly even when dev bundlers prebundle/inject duplicate copies.

## v1.9.7

- **perf(reactivity): notify buffer shrink policy** — `_notifyBuf` now shrinks to 32 when capacity grows above 64 and subsequent top-level notify usage is under 16, preventing slow memory growth in long-running apps.
- **perf(reactivity): lazy computed initialization** — `computed()` now defers effect setup and first evaluation until `.value` is read for the first time, reducing unnecessary work for conditionally read derived signals.

## v1.9.5

- **feat(build): component and DI subpath parity** — added `@deijose/nix-js/component`, `@deijose/nix-js/context`, and `@deijose/nix-js/lifecycle` so `mount`, `NixComponent`, `provide`, `inject`, and `createInjectionKey` can be imported as dedicated tree-shakeable modules.

## v1.9.4

- **feat(build): subpath exports for modular imports** — added `@deijose/nix-js/signals`, `@deijose/nix-js/router`, `@deijose/nix-js/form`, `@deijose/nix-js/store`, `@deijose/nix-js/async`, and `@deijose/nix-js/template` export paths.
- **build(lib): multi-entry output for targeted consumption** — library build now emits dedicated entry files (`signals`, `router`, `form`, `store`, `async`, `template`) in both ESM and CJS formats.
- **build(lib): deterministic shared chunk filenames** — removed hashed chunk filenames from library output so shared modules now emit stable names across builds.

## v1.9.3

- **feat(router): named routes navigation** — `RouteRecord` now supports `name`, and router navigation accepts named locations (`navigate({ name, params?, query? })` / `replace({ name, params?, query? })`) with path-string compatibility preserved.

## v1.9.2

- **feat(router): DI-first router resolution with legacy fallback** — `nixRouter()` now resolves an injected router from context first (via `RouterKey`) and falls back to the singleton created by `createRouter()` when no DI router is available.
- **feat(component): router injection at mount root** — `mount(component, container, { router })` now provides the router instance to the mounted tree, including `NixComponent` and `NixTemplate` roots.
- **refactor(router): RouterView and Link consume `nixRouter()`** — internal router consumers now respect DI-scoped router instances, enabling isolated parallel app trees (tests/micro-frontends).
- **docs: README and npm README router DI guidance** — quick-start and API summary now include `mount(..., { router })` and `RouterKey`, with explicit backward-compatibility notes.

## v1.9.1

- **feat(async): extracted query APIs to `@deijose/nix-query`** — `createQuery`, `invalidateQueries`, `clearQueryCache`, and `setQueryCacheTime` were removed from `@deijose/nix-js` and moved to the dedicated query package.
- **refactor(async): core now keeps `suspend` and `lazy` only** — async rendering/lazy-loading remain in `@deijose/nix-js` with independent suspense cache internals.
- **docs: updated README and npm README** — async API tables now reflect the split and include installation guidance for `@deijose/nix-query`.

## v1.9.0

- **feat(router): route metadata (`meta`) in resolve/guards** — `RouteRecord` now supports optional `meta`, and `router.resolve(path)` returns the original matched route record so guards and layout logic can read `route.meta` directly.
- **feat(router): scroll restoration + custom `scrollBehavior`** — router now persists scroll position per history entry and restores it on back/forward. Added optional `scrollBehavior(to, from, savedPosition)` callback for custom scroll control.
- **feat(router): hash mode routing strategy** — added `mode: "hash"` in `createRouter` options, including hash-based path/query parsing, `hashchange` synchronization, and hash-aware `Link` href generation.
- **feat(store): computed getters factory** — `createStore(initialState, actionsFactory?, gettersFactory?)` now supports a third argument for computed getter signals.
- **feat(store): global subscriptions with `$subscribe`** — added `store.$subscribe((key, newValue, oldValue) => ...)` with unsubscribe support for middleware-like use cases (persist, devtools, telemetry).
- **feat(form): nested field paths (dot-path)** — `createForm` now supports nested structures through flattened field paths (e.g. `address.city`) across `fields`, `validators`, and `setErrors`, while preserving nested `values` output shape.
- **feat(form): cross-field validators** — validators now support full-form context with signature `(value, allValues?)`, enabling password confirmation, date-range checks, and conditional required rules.
- **feat(context): `inject` default fallback** — `inject(key, defaultValue?)` now returns the provided default when the key is not found.
- **test: suite expansion and validation coverage** — expanded test coverage for router, store, and form changes. Current CI run: **484 tests passing**.
- **test: coverage (v8)** — latest coverage report: **95.86% statements**, **87.42% branches**, **95.84% functions**, **97.69% lines**.

## v1.8.1

- **fix(template): DOM write microtask safety** — added a `try/catch` wrapper inside the `queueDOMWrite` microtask loop. Prevents unhandled render errors from terminating the entire UI rendering queue.
- **fix(template): boundary marker unmounts** — introduced an explicit `endMarker` text node during HTML component mounting. Component teardown now safely halts at its own boundary rather than traversing up to unrelated DOM anchor siblings.
- **fix(async): global query cache stability** — hardened `createQuery` internal cache logic. Memory cleanup (`clearQueryCache`) now aggressively terminates the global Garbage Collector timer, and subscriber reference counting remains accurate even when subscriptions start during inflight requests.
- **test: coverage reporting** — introduced `@vitest/coverage-v8` and extensive boundary testing across routing (`RouterView`, `Link`, popstate logic) and components (`mount()` edge cases). 

## v1.8.0

- **refactor(template): modularized template runtime internals** — replaced the monolithic `src/nix/template.ts` implementation with a split module layout under `src/nix/template/` (`bindings`, `html`, `portal`, `transitions`, and supporting utilities/types) to improve maintainability and internal separation of concerns while preserving the public API.
- **test: expanded test suite** — significantly increased automated testing coverage across the framework to effectively double the number of tests (now 462 tests passing, reaching 97% code coverage), ensuring a high level of confidence for future changes.
- **chore(release): version bump to 1.8.0** — updated package version metadata for the new npm release.
- **docs(npm): bundle badge refresh** — adjusted npm-facing README badge from `~8 KB` to `~10 KB` min+gzip to match the current published artifact.

## v1.7.9

- **perf(reactivity): double-buffered notification queue** — implemented a double-buffering scheme for the notification system, reducing array allocations and overhead during complex dependency cycles.
- **fix(test): async verification stability** — improved unit test reliability by ensuring proper microtask synchronization (`nextTick`) and DOM isolation in reactive tests.
- **chore: ecosystem-wide version bump** — synchronized all packages, templates, and benchmark apps to v1.7.9.

## v1.7.6

- **perf(template): heuristic reconciliation with LIS** — implemented the Longest Increasing Subsequence (LIS) algorithm for keyed list diffing (`repeat`), minimizing DOM moves during complex list reordering.
- **perf(template): regex-free parsing** — refactored `detectContext` to use manual string scanning instead of Regular Expressions, achieving maximum parsing speed during template initialization.
- **perf(template): single-pass flat marker resolution** — refactored marker resolution to use a single-pass `TreeWalker` that builds a flat index map, replacing recursive path-based resolution for even faster component cloning.
- **perf(reactivity): high-performance dependency tracking** — implemented double-buffering for effect dependencies to avoid `new Set()` allocations per execution, and replaced expensive array spreads with optimized loops.
- **perf(template): batched DOM updates** — implemented microtask-based DOM write batching for text nodes and attributes, grouping multiple reactive updates into a single frame to prevent Layout Thrashing.
- **perf(template): table-friendly TextNode markers** — replaced expensive Comment markers with lightweight empty TextNodes in critical areas (like keyed lists and scopes), significantly improving browser layout speed and compatibility inside `<table>` elements.
- **feat(template): enhanced global event delegation** — refined the global event manager to handle complex modifiers (`.stop`, `.prevent`, `.self`, keys) at the delegation level, reducing memory usage from individual listeners.
- **perf(reactivity): V8-friendly computed signals** — optimized `computed` signals by avoiding `.bind()` and using direct `.call()` for faster execution in modern engines.

## v1.7.3

Benchmark results (1,000 rows, compared against v1.3.0 stable baseline):

| Operation | v1.3.0 JS Only | v1.7.3 JS Only | Δ JS | v1.3.0 Full Render | v1.7.3 Full Render | Δ Full |
|---|---|---|---|---|---|---|
| Create 1,000 | 220.2 ms | 20.3 ms | **–90%** | 603.9 ms | 100.6 ms | **–83%** |
| Replace 1,000 | 286.5 ms | 26.2 ms | **–90%** | 567.5 ms | 110.8 ms | **–80%** |
| Update 1/10 | 0.8 ms | 0.4 ms | **–50%** | 40.1 ms | 31.3 ms | **–22%** |
| Select | 0.3 ms | 0.1 ms | **–66%** | 21.6 ms | 23.2 ms | +7% |
| Swap (2↔998) | 53.3 ms | 15.6 ms | **–70%** | 380.5 ms | 93.0 ms | **–75%** |
| Clear 1,000 | 43.2 ms | 17.2 ms | **–60%** | 307.5 ms | 33.1 ms | **–89%** |
| Delete (1 row) | 1.9 ms | 0.9 ms | **–52%** | 44.8 ms | 27.7 ms | **–38%** |

- **perf(template): optimized marker resolution** — refactored DOM marker location to use pre-calculated paths and sibling-walk traversal, eliminating expensive `TreeWalker` or `querySelectorAll` calls during component cloning.
- **perf(template): bulk keyed insertion** — implemented `DocumentFragment` grouping for contiguous new items in keyed lists, significantly improving performance for "Create" and "Append" operations in benchmarks.
- **perf(template): cleaner clones** — source templates are now cleaned of `data-nix-*` marker attributes after paths are recorded, resulting in faster `cloneNode` operations and lighter DOM.
- **fix(template): repeat individual item removal** — fixed a bug in the keyed list (`repeat`) implementation where removing a single item from a collection failed to remove its corresponding DOM nodes.
- **docs: README simplification** — streamlined `README.md` for better readability.
- **chore: version bump to 1.7.3** — updated library and benchmark dependencies.

## v1.7.1

- **fix(exports): missing nixFieldArray** — added `nixFieldArray` and its related types to the public library entry points.
- **feat(store): added $patch and $state** — included `$patch` and `$state` in the store implementation and documentation.

## v1.7.0

- **feat(form): dynamic field arrays** — added `nixFieldArray` hook for managing lists of fields with `append`, `remove`, `move`, and `replace` operations.
- **feat(form): validation modes** — added `validateOn` option (`blur`, `input`, `submit`) to `nixField` and `createForm` for fine-grained control over when errors appear.
- **feat(form): enhanced state tracking** — added `isSubmitting`, `submitCount`, and a global `touched` signal to `createForm`.
- **feat(form): memory management** — added `dispose()` methods to `createForm` and `nixFieldArray` to explicitly clean up internal computed signals.
- **feat(form): validation coercion safety** — improved `onInput` event handling to gracefully handle non-input event targets.

## v1.6.1

- **fix(template): orphaned markers cleanup** — improved error handling during component mounting to ensure internal markers (`<!--nix-ks-->`/`<!--nix-ke-->`) and their content are properly removed from the DOM if an error occurs.
- **docs: fix documentation URL** — corrected the live demo link in `README.md`.

## v1.6.0

- **feat(store): state snapshot** — added `$state` property to stores to provide a read-only snapshot of the current state.
- **feat(store): batch updates** — added `$patch` method to perform multiple state changes atomically.
- **feat(store): reserved keys protection** — prevented using reserved names (like `$patch`, `$state`, `$reset`) as state keys or action names.

## v1.5.9

- **fix(reactivity): safe effect disposal** — added internal `disposed` flag to `effect` to prevent execution after the disposal function has been called.
- **feat(reactivity): explicit computed disposal** — `computed` signals now expose a `.dispose()` method that explicitly cleans up the underlying effect.
- **fix(template): keyed list error resilience** — keyed markers (`<!--nix-ks-->`/`<!--nix-ke-->`) are now automatically removed from the DOM if the user's `renderFn` throws during initial insertion, preventing orphaned markers and memory leaks.
- **docs: README overhaul** — complete rewrite of the `README.md` with detailed architecture diagrams, comprehensive API reference for all modules, and developer guides.
- **docs: CHANGELOG cleanup** — corrected v1.5.8 benchmark metrics and clarified optimization summaries.

## v1.5.8

Benchmark results (1,000 rows, compared against v1.3.0 stable baseline):

| Operation | v1.3.0 JS Only | v1.5.8 JS Only | Δ JS | v1.3.0 Full Render | v1.5.8 Full Render | Δ Full |
|---|---|---|---|---|---|---|
| Create 1,000 | 220.20 ms | 66.77 ms | **–70%** | 603.90 ms | 154.87 ms | **–74%** |
| Replace 1,000 | 286.50 ms | 89.87 ms | **–69%** | 567.50 ms | 201.78 ms | **–64%** |
| Update 1/10 | 0.80 ms | 1.40 ms | +75%* | 40.10 ms | 28.33 ms | **–29%** |
| Select | 0.30 ms | 0.02 ms | **–93%** | 21.60 ms | 27.87 ms | +29%* |
| Swap (2↔998) | 53.30 ms | 25.47 ms | **–52%** | 380.50 ms | 121.03 ms | **–68%** |
| Clear 1,000 | 43.20 ms | 28.18 ms | **–35%** | 307.50 ms | 57.83 ms | **–81%** |
| Delete (1 row) | 1.90 ms | 1.50 ms | **–26%** | 44.80 ms | 33.27 ms | **–26%** |


- **perf(template): O(depth) marker resolution** — reaching markers via pre-computed index paths instead of TreeWalker, drastically reducing creation time (**–74% Full Render**).
- **perf(template): bulk keyed-list clear** — uses `Range.deleteContents()` for atomic list removal (**–81% Full Render**).
- **perf(template): DocumentFragment move buffer** — optimized keyed row reordering (**–68% Full Render**).
- **fix(bundle):** Resolved issues with the library bundle exports and structure.
- **chore:** Documentation and README updates.


## v1.5.6

Benchmark results (1,000 rows, js-framework-benchmark style — compared against v1.3.0 stable baseline):

| Operation | v1.3.0 JS Only | v1.5.6 JS Only | Δ JS | v1.3.0 Full Render | v1.5.6 Full Render | Δ Full |
|---|---|---|---|---|---|---|
| Create 1,000 | 220.20 ms | 90.10 ms | **–59%** | 603.90 ms | 187.00 ms | **–69%** |
| Replace 1,000 | 286.50 ms | 87.80 ms | **–69%** | 567.50 ms | 170.80 ms | **–70%** |
| Update 1/10 | 0.80 ms | 0.50 ms | **–37%** | 40.10 ms | 32.10 ms | **–20%** |
| Select | 0.30 ms | 0.20 ms | **–33%** | 21.60 ms | 22.40 ms | ~flat |
| Swap (2↔998) | 53.30 ms | 17.30 ms | **–68%** | 380.50 ms | 131.10 ms | **–66%** |
| Clear 1,000 | 43.20 ms | 23.40 ms | **–46%** | 307.50 ms | 31.00 ms | **–90%** |
| Delete (1 row) | 1.90 ms | 0.60 ms | **–68%** | 44.80 ms | 35.50 ms | **–21%** |

Every single operation improved. The most dramatic gains are in bulk operations — Clear Full Render dropped from 307 ms to 31 ms, and Create/Replace/Swap all shed roughly 65–70% of their original cost.

- **perf(template): O(depth) marker resolution with automatic fallback** — `TemplateCache` now stores pre-computed `childNodes` index paths (`commentMarkers`, `attrMarkers`) from the `DocumentFragment` root to each marker, calculated once via `_computePath` when a template literal is first encountered. Every render clone resolves markers via `_walkPath` — a plain `node = node.childNodes[step]` loop — eliminating TreeWalker and `querySelectorAll` from the per-row hot path entirely. When the browser inserts implicit structural nodes (`<tbody>`, SVG whitespace, etc.) that shift indices, `_walkPath` returns `null` and a lazy `_lazyScanComments` / `_lazyScanAttrs` fallback activates transparently; the result is memoized per clone so the scan runs at most once regardless of binding count. Primary driver of the Create/Replace improvements: **–59% / –69% JS-only, –69% / –70% Full Render**.
- **perf(template): bulk keyed-list clear via `Range.deleteContents()`** — a `<!--nix-kz-->` zone marker is inserted once before the first keyed entry. Clearing all rows issues a single `Range.deleteContents()` instead of N individual `removeChild` calls. Reactive effect cleanup still runs per-entry to unsubscribe signals — DOM ops inside are no-ops since nodes are already detached. **Clear JS-only: 43.20 ms → 23.40 ms (–46%). Clear Full Render: 307.50 ms → 31.00 ms (–90%).**
- **perf(template): `DocumentFragment` move buffer for keyed reorder** — nodes are extracted from the live DOM via `frag.appendChild` and reinserted with a single `insertBefore`, replacing a `Node[]` array + N individual `insertBefore` calls. Primary driver of the Swap improvement: **JS-only 53.30 ms → 17.30 ms (–68%). Full Render 380.50 ms → 131.10 ms (–66%).**
- **perf(template): `Set`-based event modifier lookup** — a `Set<string>` is built once at listener registration; per-fire checks (`prevent`, `stop`, `self`, etc.) use `Set.has` O(1) instead of `Array.includes` O(n). Contributes to Update and Delete JS improvements.
- **perf(template): template parse cache via `WeakMap<TemplateStringsArray>`** — HTML parsing, `buildHTML`, and context detection run once per unique `html\`\`` call site. Subsequent renders clone via `tpl.content.cloneNode(true)`.
- **refactor(template): `_mountComponent*` helper extraction** — `_mountComponent`, `_mountComponentSilent`, `_mountComponentWithCtx`, and `_mountComponentDeferred` replace ~9 inline repetitions of the push/pop context + lifecycle pattern. `createErrorBoundary` retains its inline block to intercept `errored` between render and mount phases.
- **refactor(template): misc micro-optimisations** — `COMMENT` constants object; `KEntry` promoted to module level; `skipLeading` → `Set<number>`; `KEY_MAP` moved to module level (was recreated per event binding); `_cssMaxDuration` uses `parseFloat(s.trim())`; `_waitTransitionEnd` simplified to `ms > 0 ? ms + 100 : fallbackMs`; loop variable `i` → `idx` in keyed list map.

## v1.5.4-beta.4
- **fix(template): null-safe `_walkPath` + lazy fallback scan** — the path-based marker lookup introduced in beta.2 crashed on templates where the browser inserts implicit nodes (`<tbody>`, SVG whitespace, etc.) that shift `childNodes` indices between the original template and its clone. `_walkPath` now returns `null` on out-of-bounds access instead of `undefined`-dereferencing. On any miss, a lazy `_lazyScanComments` / `_lazyScanAttrs` fallback runs once per clone (memoized in `fallbackComments` / `fallbackAttrs`) and is used for that binding only. Simple templates continue to use the O(depth) fast path; complex templates with implicit browser nodes fall back transparently with zero behavioural difference.

## v1.5.4-beta.3
- **fix(template): revert hard path-cache — replaced with null-safe version** — beta.2 path caching caused `Cannot read properties of undefined (reading 'parentNode')` on real-world project templates. Root cause: `_computePath` recorded indices from `tpl.content` after HTML parsing, but `cloneNode(true)` structural fidelity is not guaranteed when the browser inserts implicit nodes. Reverted to safe TreeWalker/querySelectorAll baseline while the null-safe+fallback approach was developed for beta.4.

## v1.5.4-beta.2
- **perf(template): pre-computed marker paths eliminate TreeWalker and querySelectorAll from hot render path** — `TemplateCache` now stores `commentMarkers: Map<number, CachedCommentMarker>` and `attrMarkers: Map<number, CachedAttrMarker>`. On first encounter of a template literal, `_computePath` records the `childNodes` index route from the `DocumentFragment` root to each marker node. Every subsequent render clone reaches its markers via `_walkPath` — a simple loop of `node = node.childNodes[step]` — in O(depth) instead of O(all nodes). TreeWalker and querySelectorAll are eliminated from the 1,000-row render hot path entirely. *(Note: this version contained a crash on templates with browser-inserted implicit nodes — fixed in beta.3/beta.4.)*

## v1.5.4-beta.1
- **perf(template): bulk keyed-list clear + `DocumentFragment` move buffer + `Set` modifier lookup** — three independent optimisations landed together:
  - `Range.deleteContents()` bulk clear: a `<!--nix-kz-->` zone marker is inserted once before the first keyed entry. Clearing all rows issues one browser operation instead of N `removeChild` calls. JS-only Clear benchmark: **157 ms → 21 ms (–87%)**.
  - `DocumentFragment` as move buffer for keyed reorder: nodes are extracted from the live DOM via `frag.appendChild` and reinserted with a single `insertBefore`, replacing a `Node[]` array + N individual `insertBefore` calls. Swap JS-only: **20 ms → 18.6 ms**.
  - `Set`-based modifier lookup: `new Set(mods)` is built once at listener registration; per-fire checks use `Set.has` (O(1)) instead of `Array.includes` (O(n)).

## v1.5.4-beta.0
- **perf(template): template parse cache + `_mountComponent*` helper extraction** — establishes the performance baseline for the v1.5.4 optimisation series.
  - `WeakMap<TemplateStringsArray, TemplateCache>` cache: HTML parsing, `buildHTML`, and context detection run once per unique `html\`\`` call site. Subsequent renders clone via `tpl.content.cloneNode(true)`. JS-only Create baseline recorded at **~86 ms** (down from ~78 ms before cache due to TreeWalker/querySelectorAll still running per clone — addressed in beta.2).
  - Extracted `_mountComponent`, `_mountComponentSilent`, `_mountComponentWithCtx`, and `_mountComponentDeferred` helpers, replacing ~9 inline repetitions of the push/pop context + lifecycle pattern. `createErrorBoundary` retains its inline block intentionally to intercept `errored` between render and mount phases.
  - Misc micro-opts: `COMMENT` constants object; `KEntry` to module level; `skipLeading` → `Set<number>`; `KEY_MAP` to module level (was recreated per event binding); `_cssMaxDuration` uses `parseFloat(s.trim())`; `_waitTransitionEnd` simplified; loop variable `i` → `idx` in keyed list map.

## v1.5.4
- **perf(template): bulk keyed-list clear via `Range.deleteContents()`** — clearing all rows (e.g. "Limpiar todo") now issues a single browser DOM operation instead of N individual `removeChild` calls. A `<!--nix-kz-->` zone marker is inserted once before the first keyed entry; on full clear a `Range` spanning that marker to the anchor removes all row DOM atomically. Reactive effect cleanup (`entry.cleanup()`) still runs per-entry to unsubscribe signals — DOM ops inside become no-ops since nodes are already detached. **Clear: 157 ms → 21 ms (–87%).**
- **perf(template): `DocumentFragment` as move buffer for keyed reorder** — when a keyed entry needs to move (swap, sort), nodes are now collected into a detached `DocumentFragment` via `appendChild` (which extracts them from the live DOM) and reinserted with a single `insertBefore`. Replaces the previous pattern of allocating an intermediate `Node[]` array and issuing N individual `insertBefore` calls. Eliminates the array allocation and halves DOM operations per move. **Swap JS time: 20 ms → 18.6 ms.**
- **perf(template): `Set`-based modifier lookup in event handlers** — event modifier checks (`prevent`, `stop`, `self`, etc.) previously used `Array.prototype.includes` (O(n)) on every event fire. A `Set<string>` is now built once at listener registration time, reducing per-fire modifier checks to O(1) `Set.has` calls.

## v1.5.3
- **perf(template): template cache via `WeakMap<TemplateStringsArray>`** — tagged template literals always return the same `strings` reference per call site. HTML parsing (`innerHTML`), context detection, and `buildHTML` string construction now run only once per unique `html\`\`` literal. Subsequent renders clone the cached `HTMLTemplateElement` via `tpl.content.cloneNode(true)` instead of creating a new element and re-parsing HTML.
- **refactor(template): extract four `_mountComponent*` helpers** — replaced ~9 repetitions of the push/pop context + lifecycle pattern with dedicated helpers: `_mountComponent`, `_mountComponentSilent`, `_mountComponentWithCtx`, and `_mountComponentDeferred`. `createErrorBoundary` intentionally keeps its inline block to intercept the `errored` flag between render and mount phases.
- **refactor(template): misc micro-optimizations** — `COMMENT` constants object for all comment marker strings; `KEntry` interface promoted to module level; `skipLeading` changed from `Array` to `Set<number>`; `KEY_MAP` moved to module level (was recreated per event binding); `_cssMaxDuration` uses `parseFloat(s.trim())`; `_waitTransitionEnd` wait calculation simplified to `ms > 0 ? ms + 100 : fallbackMs`; loop variable shadowing `i` → `idx` in keyed list map.

## v1.3.0
- **feat(router): robust base path support** — the router now natively supports running under a sub-path prefix (like GitHub Pages).
  - Automatically detects the `<base href>` tag injected by Vite when `base: "/slug/"` is configured.
  - Added new `RouterOptions` interface in `createRouter(routes, { base: '/slug/' })` for explicit configuration.
  - Native integration with `router.current`, `<Link>`, and History API pushes to seamlessly respect the active base.

## v1.2.0
- **feat(async): built-in query caching** — `createQuery` now caches resolved data globally by key (stale-while-revalidate). When a component remounts, cached data renders **instantly** (no loading spinner) while a background refetch runs.
- New `QueryOptions`:
  - `staleTime` — time (ms) that cached data is considered fresh (default `0`)
  - `refetchOnMount` — `"always"` | `"stale"` | `false` (default `"always"`)
- New `SuspenseOptions`:
  - `cacheKey` — opt-in caching for `suspend()` with the same global cache
  - `staleTime` — same semantics as `QueryOptions.staleTime`
- New exports: `clearQueryCache(key?)`, `setQueryCacheTime(ms)`
- `invalidateQueries(key)` now also clears the cache entry for that key
- Automatic garbage collection of unused cache entries (default 5 min TTL)

## v1.1.3
- chore: add homepage link to landing page

## v1.1.2
- chore: add MIT LICENSE file, include in npm package

## v1.1.1
- Fixed `createQuery`, `invalidateQueries`, and `QueryOptions` missing from the root `src/index.ts` export barrel (consumers got TS error: `has no exported member`)
- Also added `AfterEachHook` and `ResolvedRoute` router types that were missing from the root barrel

## v1.1.0
- Added `invalidate` option to `suspend()` — re-fetch data without destroying/recreating the DOM
- Added `createQuery(key, asyncFn, renderFn, opts)` — key-based async data fetching
- Added `invalidateQueries(key)` — global invalidation of active queries by key
- New exports: `createQuery`, `invalidateQueries`, `QueryOptions`
- 6 new tests (158 total)

## v1.0.9
- feat: `suspend()` invalidate + `createQuery` / `invalidateQueries` support

## v1.0.8
- Added `NixTemplate` return type annotation to all function component examples in README and `.readme-npm.md`
- Documented `NixTemplate` as the recommended pattern for pages and display components alongside `NixComponent`

## v1.0.7
- All source comments and JSDoc translated to concise English
- README rewritten: professional badges, expanded architecture diagram, Quick Start section, complete API Reference, accurate bundle sizes (~24 KB min / ~8 KB gzip), framework comparison (two tables), Contributing guide, Changelog

## v1.0.6
- Implemented all router methods: `replace`, `back`, `forward`, `go`, `isActive`, `resolve`, `afterEach`
- Fixed `.d.ts` type declarations for npm consumers

## v1.0.5
- Security audit: hardened `template.ts` against XSS via `textContent` for user-provided strings
- Encoded URI components in router to prevent path injection
- Added `decodeURIComponent` with fallback for malformed percent-encoding

## v1.0.4
- Added route guards (`beforeEach`, `beforeEnter`) with async support
- Added `afterEach` navigation hooks
- Added `router.resolve()` for route inspection without navigation

## v1.0.3
- Initial public API with reactivity, templates, components, router, forms, stores, DI, portals, error boundaries, and transitions
