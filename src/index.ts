// Nix.js — Public Library Entry Point
// Single entry for the compiled library. Import from here as an npm consumer:
//   import { signal, html, NixComponent, mount } from "@deijose/nix-js";

// --- Values ---
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
    showWhen,
    portal,
    createPortalOutlet,
    portalOutlet,
    provideOutlet,
    injectOutlet,
    createErrorBoundary,
    transition,
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
    createQuery,
    invalidateQueries,
    clearQueryCache,
    setQueryCacheTime,
    // Dependency Injection
    provide,
    inject,
    createInjectionKey,
    // Forms
    useField,
    useFieldArray,
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

// --- Types ---
export type {
    // Reactivity
    WatchOptions,
    // Templates
    NixTemplate,
    NixMountHandle,
    KeyedList,
    NixRef,
    PortalOutlet,
    ErrorFallback,
    TransitionOptions,
    TransitionContent,
    // Store
    Store,
    StoreSignals,
    // Router
    Router,
    RouteRecord,
    RouterOptions,
    NavigationGuard,
    NavigationGuardResult,
    AfterEachHook,
    ResolvedRoute,
    ScrollPosition,
    ScrollBehavior,
    RouterMode,
    // Async
    SuspenseOptions,
    QueryOptions,
    // Dependency Injection
    InjectionKey,
    // Forms
    Validator,
    ValidateOn,
    FieldState,
    FieldArrayState,
    FieldErrors,
    FormState,
    FormOptions,
    ValidatorsBase,
    NixChildren,
} from "./nix";
