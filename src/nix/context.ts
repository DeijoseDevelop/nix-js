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

/** @internal — returns a copy of the stack for capturing in effect closures. */
export function _captureContextSnapshot(): Map<unknown, unknown>[] {
    return [..._stack];
}

/** @internal — pushes an empty context for a new component (static render). */
export function _pushComponentContext(): void {
    _stack.push(new Map());
}

/** @internal — pops the current component context (static render). */
export function _popComponentContext(): void {
    _stack.pop();
}

/**
 * @internal — executes `fn` with `parentSnapshot` as ancestors and a fresh
 * empty context on top, then restores the previous stack.
 */
export function _withComponentContext<T>(
    parentSnapshot: Map<unknown, unknown>[],
    fn: () => T
): T {
    const saved = _stack.splice(0);
    parentSnapshot.forEach(m => _stack.push(m));
    _stack.push(new Map());
    try {
        return fn();
    } finally {
        _stack.splice(0);
        saved.forEach(m => _stack.push(m));
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
    const top = _stack[_stack.length - 1];
    if (!top) {
        throw new Error(
            "[Nix] provide() must be called inside onInit() of a NixComponent."
        );
    }
    top.set(key, value);
}

/**
 * Retrieves a value provided by an ancestor component.
 * Searches child-to-parent; returns `undefined` if the key was not provided.
 */
export function inject<T>(
    key: InjectionKey<T> | string | symbol
): T | undefined {
    for (let i = _stack.length - 1; i >= 0; i--) {
        if (_stack[i].has(key)) {
            return _stack[i].get(key) as T;
        }
    }
    return undefined;
}
