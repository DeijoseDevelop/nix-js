// --- Public types ---

/** Typed key for provide/inject. Generic `T` enforces type safety between provider and consumer. */
export type InjectionKey<T> = symbol & { readonly __nixType?: T };

/** Creates a unique typed InjectionKey. */
export function createInjectionKey<T>(description?: string): InjectionKey<T> {
    return Symbol(description) as InjectionKey<T>;
}

// --- Internal stack ---

/** Stack of provide maps, one per active component in the render tree. */
const _stack: Map<unknown, unknown>[] = [];
let _scopeResolver: (() => Map<unknown, unknown>[] | undefined) | undefined;

function currentStack(): Map<unknown, unknown>[] {
    return _scopeResolver?.() ?? _stack;
}

export function _setContextScopeResolver(
    resolver: (() => Map<unknown, unknown>[] | undefined) | undefined,
): void {
    _scopeResolver = resolver;
}

/** @internal — returns a copy of the stack for capturing in effect closures. */
export function _captureContextSnapshot(): Map<unknown, unknown>[] {
    return [...currentStack()];
}

/** @internal — pushes an empty context for a new component (static render). */
export function _pushComponentContext(): void {
    currentStack().push(new Map());
}

/** @internal — pops the current component context (static render). */
export function _popComponentContext(): void {
    currentStack().pop();
}

/**
 * @internal — executes `fn` with `parentSnapshot` as ancestors and a fresh
 * empty context on top, then restores the previous stack.
 */
export function _withComponentContext<T>(
    parentSnapshot: Map<unknown, unknown>[],
    fn: () => T
): T {
    const stack = currentStack();
    const saved = stack.splice(0);
    parentSnapshot.forEach(m => stack.push(m));
    stack.push(new Map());
    try {
        return fn();
    } finally {
        stack.splice(0);
        saved.forEach(m => stack.push(m));
    }
}

// --- Public API ---

/**
 * Registers a value so descendant components can retrieve it via `inject()`.
 * Must be called inside `onInit()` of a NixComponent.
 */
export function provide<T>(
    key: InjectionKey<T> | string | symbol,
    value: T
): void {
    const stack = currentStack();
    const top = stack[stack.length - 1];
    if (!top) {
        throw new Error(
            "[nix-js] provide() must be called inside onInit() of a NixComponent."
        );
    }
    top.set(key, value);
}

/**
 * Retrieves a value provided by an ancestor component.
 * Searches child-to-parent; returns `undefined` if the key was not provided.
 */
export function inject<T>(
    key: InjectionKey<T> | string | symbol,
    defaultValue?: T
): T | undefined {
    const stack = currentStack();
    for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].has(key)) {
            return stack[i].get(key) as T;
        }
    }
    return defaultValue;
}
