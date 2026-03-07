// ❄️ Nix.js — Public Library Entry Point
//
// This file is the single entry point for the compiled library.
// Import from here when using Nix.js as an installed package:
//
//   import { signal, html, NixComponent, mount } from "nix-js";

// ── Values ────────────────────────────────────────────────────────────────────
export {
    // Reactivity
    Signal,
    signal,
    effect,
    computed,
    batch,
    watch,
    untrack,
    nextTick,
    // Templates
    html,
    repeat,
    ref,
    // Components
    mount,
    NixComponent,
    // Store
    createStore,
    // Router
    createRouter,
    RouterView,
    Link,
    useRouter,
    // Async / Lazy
    suspend,
    lazy,
    // Dependency Injection
    provide,
    inject,
    createInjectionKey,
    // Forms
    useField,
    createForm,
    required,
    minLength,
    maxLength,
    email,
    pattern,
    min,
    max,
    createValidator,
    validators,
    extendValidators,
} from "./nix";

// ── Types ─────────────────────────────────────────────────────────────────────
export type {
    // Reactivity
    WatchOptions,
    // Templates
    NixTemplate,
    NixMountHandle,
    KeyedList,
    NixRef,
    // Store
    Store,
    StoreSignals,
    // Router
    Router,
    RouteRecord,
    // Async
    SuspenseOptions,
    // Dependency Injection
    InjectionKey,
    // Forms
    Validator,
    FieldState,
    FieldErrors,
    FormState,
    FormOptions,
    ValidatorsBase,
    NixChildren,
} from "./nix";
