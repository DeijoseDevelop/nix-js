import { signal, computed } from "./reactivity";
import type { Signal } from "./reactivity";

// --- Validator ---

/** A validator function. Return an error string, or null/undefined if valid. */
export type Validator<T> = (value: T) => string | null | undefined;

// --- Built-in validators ---

export function required(message = "Required"): Validator<unknown> {
    return (v) =>
        v == null || v === "" || (Array.isArray(v) && v.length === 0)
            ? message
            : null;
}

export function minLength(n: number, message?: string): Validator<string> {
    return (v) =>
        typeof v === "string" && v.length < n
            ? (message ?? `Minimum ${n} characters`)
            : null;
}

export function maxLength(n: number, message?: string): Validator<string> {
    return (v) =>
        typeof v === "string" && v.length > n
            ? (message ?? `Maximum ${n} characters`)
            : null;
}

export function pattern(regex: RegExp, message = "Invalid format"): Validator<string> {
    return (v) => (typeof v === "string" && !regex.test(v) ? message : null);
}

export function email(message = "Invalid email"): Validator<string> {
    return pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, message);
}

export function min(n: number, message?: string): Validator<number> {
    return (v) =>
        typeof v === "number" && v < n
            ? (message ?? `Minimum value is ${n}`)
            : null;
}

export function max(n: number, message?: string): Validator<number> {
    return (v) =>
        typeof v === "number" && v > n
            ? (message ?? `Maximum value is ${n}`)
            : null;
}

// --- Custom validator API ---

/** Creates a typed custom validator compatible with `useField` and `createForm`. */
export function createValidator<T>(
    fn: (value: T) => string | null | undefined
): Validator<T> {
    return fn;
}

/** All built-in validators grouped as a namespace. Extensible via `extendValidators`. */
export const validators = {
    required,
    minLength,
    maxLength,
    email,
    pattern,
    min,
    max,
} as const;

/** Shape of the built-in `validators` namespace. Used as the base type for `extendValidators`. */
export type ValidatorsBase = typeof validators;

/**
 * Merges custom validator factories into the built-in namespace.
 * Returns a new object — the original is never mutated.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extendValidators<E extends Record<string, (...args: any[]) => Validator<any>>>(
    base: ValidatorsBase,
    extensions: E
): ValidatorsBase & E {
    return { ...base, ...extensions };
}

// --- validateOn ---

/**
 * Controls when validation errors become visible.
 * - `"blur"` — after the field loses focus (default)
 * - `"input"` — as soon as the user types
 * - `"submit"` — only after the first submit attempt
 */
export type ValidateOn = "blur" | "input" | "submit";

// --- FieldState ---

/** Public state of a single form field. */
export interface FieldState<T> {
    /** Current value — read/write signal. */
    value: Signal<T>;
    /**
     * Current error message, or null.
     * Visibility depends on `validateOn` option.
     */
    readonly error: Signal<string | null>;
    /** True after the input has lost focus at least once. */
    touched: Signal<boolean>;
    /** True after the user has typed at least once. */
    dirty: Signal<boolean>;
    /** Attach to `@input` on any `<input>`, `<select>`, `<textarea>`. */
    readonly onInput: (e: Event) => void;
    /** Attach to `@blur`. */
    readonly onBlur: () => void;
    /** Reset to initial value and clear touched/dirty/error state. */
    reset(): void;
    /**
     * @internal — inject an external error message (server / schema validator).
     * The error clears automatically when the user next edits the field.
     */
    _setExternalError(msg: string | null): void;
    /** @internal — force error visibility (e.g., on submit). */
    _forceVisible(): void;
    /** @internal — dispose computed signals. */
    _dispose(): void;
}

// --- useField ---

/** Creates a standalone reactive form field with optional validators. */
export function useField<T>(
    initialValue: T,
    fieldValidators: Validator<T>[] = [],
    validateOn: ValidateOn = "blur",
): FieldState<T> {
    const value = signal(initialValue);
    const touched = signal(false);
    const dirty = signal(false);
    const _ext = signal<string | null>(null);
    // Tracks whether the form has been submitted at least once (injected externally)
    const _submitted = signal(false);

    const error = computed<string | null>(() => {
        if (_ext.value) return _ext.value;

        // Determine whether errors should be visible yet based on validateOn
        const isVisible =
            validateOn === "input" ? dirty.value || touched.value :
                validateOn === "submit" ? _submitted.value :
            /* blur (default) */      touched.value;

        if (!isVisible) return null;

        for (const v of fieldValidators) {
            const e = v(value.value);
            if (e) return e;
        }
        return null;
    });

    function coerce(target: EventTarget | null): T {
        if (!target || !("value" in target)) return initialValue;
        const t = target as HTMLInputElement;
        if (typeof initialValue === "boolean") return t.checked as unknown as T;
        if (typeof initialValue === "number") return Number(t.value) as unknown as T;
        return t.value as unknown as T;
    }

    const onInput = (e: Event): void => {
        value.value = coerce(e.target);
        dirty.value = true;
        _ext.value = null;
    };

    const onBlur = (): void => { touched.value = true; };

    function reset(): void {
        value.value = initialValue;
        touched.value = false;
        dirty.value = false;
        _ext.value = null;
        _submitted.value = false;
    }

    function _setExternalError(msg: string | null): void {
        _ext.value = msg;
        if (msg) touched.value = true;
    }

    function _forceVisible(): void {
        touched.value = true;
        _submitted.value = true;
    }

    function _dispose(): void {
        error.dispose();
    }

    return { value, error, touched, dirty, onInput, onBlur, reset, _setExternalError, _forceVisible, _dispose };
}

// --- FieldArrayState ---

/** Public state of a field array (dynamic list of field groups). */
export interface FieldArrayState<T extends Record<string, unknown>> {
    /** Reactive list of field group states. */
    readonly fields: Signal<Array<{ [K in keyof T]: FieldState<T[K]> }>>;
    /** Appends a new item to the end of the array. */
    append(value: T): void;
    /** Removes the item at the given index. */
    remove(index: number): void;
    /**
     * Moves an item from `from` to `to` index.
     * Items between the two positions shift to fill the gap.
     */
    move(from: number, to: number): void;
    /** Replaces the item at the given index with new values. */
    replace(index: number, value: T): void;
    /** Number of items in the array. Reactive. */
    readonly length: Signal<number>;
    /** Resets the array to its initial value. */
    reset(): void;
    /** @internal */
    _dispose(): void;
}

/**
 * Creates a reactive array of field groups for dynamic list forms.
 *
 * @example
 * const items = useFieldArray([{ name: "" }], {
 *     name: [required()],
 * });
 * items.append({ name: "nuevo" });
 * items.remove(0);
 */
export function useFieldArray<T extends Record<string, unknown>>(
    initialItems: T[],
    fieldValidators: { [K in keyof T]?: Validator<T[K]>[] } = {},
    validateOn: ValidateOn = "blur",
): FieldArrayState<T> {
    function makeGroup(item: T): { [K in keyof T]: FieldState<T[K]> } {
        const group = {} as { [K in keyof T]: FieldState<T[K]> };
        for (const key in item) {
            const vs = (fieldValidators[key] ?? []) as Validator<T[typeof key]>[];
            (group as Record<string, unknown>)[key] = useField(item[key], vs, validateOn);
        }
        return group;
    }

    const fields = signal<Array<{ [K in keyof T]: FieldState<T[K]> }>>(
        initialItems.map(makeGroup)
    );

    const length = computed(() => fields.value.length);

    function append(value: T): void {
        fields.value = [...fields.value, makeGroup(value)];
    }

    function remove(index: number): void {
        const current = fields.value;
        if (index < 0 || index >= current.length) return;
        // Dispose computed signals of the removed group before discarding
        for (const key in current[index]) {
            current[index][key]._dispose();
        }
        fields.value = current.filter((_, i) => i !== index);
    }

    function move(from: number, to: number): void {
        const current = [...fields.value];
        if (
            from < 0 || from >= current.length ||
            to < 0 || to >= current.length ||
            from === to
        ) return;
        const [item] = current.splice(from, 1);
        current.splice(to, 0, item);
        fields.value = current;
    }

    function replace(index: number, value: T): void {
        const current = [...fields.value];
        if (index < 0 || index >= current.length) return;
        // Dispose old group before replacing
        for (const key in current[index]) {
            current[index][key]._dispose();
        }
        current[index] = makeGroup(value);
        fields.value = current;
    }

    function reset(): void {
        // Dispose all current groups
        for (const group of fields.value) {
            for (const key in group) group[key]._dispose();
        }
        fields.value = initialItems.map(makeGroup);
    }

    function _dispose(): void {
        for (const group of fields.value) {
            for (const key in group) group[key]._dispose();
        }
        length.dispose();
    }

    return { fields, append, remove, move, replace, length, reset, _dispose };
}

// --- FormState ---

/** Map of field-name → error message for external validation results. */
export type FieldErrors<T extends Record<string, unknown>> = {
    [K in keyof T]?: string | null;
};

export interface FormState<T extends Record<string, unknown>> {
    /** Individual field states — access value, error, event handlers. */
    fields: { [K in keyof T]: FieldState<T[K]> };
    /** Computed snapshot of all current field values. */
    readonly values: Signal<T>;
    /** Computed map of all currently visible field errors. */
    readonly errors: Signal<FieldErrors<T>>;
    /** True when no field has a visible error (meaningful after submit / touch-all). */
    readonly valid: Signal<boolean>;
    /** True when at least one field has been modified. */
    readonly dirty: Signal<boolean>;
    /** True when at least one field has been touched (lost focus). */
    readonly touched: Signal<boolean>;
    /** True while the submit callback is executing (async-safe). */
    readonly isSubmitting: Signal<boolean>;
    /** Number of times the form has been submitted (including failed validations). */
    readonly submitCount: Signal<number>;
    /**
     * Wraps a submit callback. Returned handler:
     * 1. Calls `e.preventDefault()`
     * 2. Increments `submitCount` and marks all fields as visible
     * 3. Runs `options.validate` if provided (Zod, etc.)
     * 4. Only calls `fn(values)` if all validations pass
     * 5. Manages `isSubmitting` across async callbacks
     */
    handleSubmit(fn: (values: T) => void | Promise<void>): (e: Event) => void;
    /** Reset all fields to their initial values. */
    reset(): void;
    /**
     * Inject external errors (e.g., from a server response) into specific fields.
     * Each field's error clears automatically the next time the user edits it.
     */
    setErrors(errors: FieldErrors<T>): void;
    /**
     * Disposes all internal computed signals.
     * Call in `onUnmount` when the form lives inside a component.
     */
    dispose(): void;
}

export interface FormOptions<T extends Record<string, unknown>> {
    /** Per-field built-in validators. */
    validators?: { [K in keyof T]?: Validator<T[K]>[] };
    /**
     * Controls when validation errors become visible.
     * - `"blur"` — after the field loses focus (default)
     * - `"input"` — as soon as the user types
     * - `"submit"` — only after the first submit attempt
     */
    validateOn?: ValidateOn;
    /**
     * Optional schema-level validator — runs on submit after built-in validators pass.
     * Return `null` / `undefined` if valid, or a field→error map if not.
     * String arrays are accepted (first element shown per field).
     *
     * @example Zod interop
     * ```typescript
     * validate(values) {
     *   const r = schema.safeParse(values);
     *   if (r.success) return null;
     *   return Object.fromEntries(
     *     Object.entries(r.error.flatten().fieldErrors)
     *           .map(([k, v]) => [k, v?.[0]])
     *   );
     * }
     * ```
     */
    validate?: (
        values: T
    ) => { [K in keyof T]?: string | string[] | null | undefined } | null | undefined;
}

// --- createForm ---

/**
 * Creates a managed form with reactive fields, built-in validation,
 * schema-level validation (Zod/Valibot/Yup/custom), and submit handling.
 */
export function createForm<T extends Record<string, unknown>>(
    initialValues: T,
    options: FormOptions<T> = {}
): FormState<T> {
    const validateOn: ValidateOn = options.validateOn ?? "blur";

    const fields = {} as { [K in keyof T]: FieldState<T[K]> };
    for (const key in initialValues) {
        const vs = (options.validators?.[key] ?? []) as Validator<T[typeof key]>[];
        (fields as Record<string, unknown>)[key] = useField(initialValues[key], vs, validateOn);
    }

    const isSubmitting = signal(false);
    const submitCount = signal(0);

    const values = computed<T>(() => {
        const r = {} as T;
        for (const k in fields) (r as Record<string, unknown>)[k] = fields[k].value.value;
        return r;
    });

    const errors = computed<FieldErrors<T>>(() => {
        const r: FieldErrors<T> = {};
        for (const k in fields) {
            const e = fields[k].error.value;
            if (e) (r as Record<string, unknown>)[k] = e;
        }
        return r;
    });

    const valid = computed<boolean>(() => {
        for (const k in fields) if (fields[k].error.value) return false;
        return true;
    });

    const dirty = computed<boolean>(() => {
        for (const k in fields) if (fields[k].dirty.value) return true;
        return false;
    });

    const touched = computed<boolean>(() => {
        for (const k in fields) if (fields[k].touched.value) return true;
        return false;
    });

    function setErrors(errs: FieldErrors<T>): void {
        for (const k in errs) fields[k]?._setExternalError(errs[k] ?? null);
    }

    function reset(): void {
        for (const k in fields) fields[k].reset();
        isSubmitting.value = false;
        submitCount.value = 0;
    }

    function dispose(): void {
        values.dispose();
        errors.dispose();
        valid.dispose();
        dirty.dispose();
        touched.dispose();
        for (const k in fields) fields[k]._dispose();
    }

    function handleSubmit(fn: (values: T) => void | Promise<void>) {
        return (e: Event): void => {
            e.preventDefault();

            submitCount.value++;

            // Force error visibility on all fields regardless of validateOn
            for (const k in fields) fields[k]._forceVisible();

            const currentValues = values.value;

            // Run schema-level validator (Zod, Valibot, etc.)
            if (options.validate) {
                const ext = options.validate(currentValues);
                if (ext) {
                    const mapped: FieldErrors<T> = {};
                    let hasAny = false;
                    for (const k in ext) {
                        const v = (ext as Record<string, string | string[] | null | undefined>)[k];
                        const msg = Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
                        if (msg) {
                            (mapped as Record<string, unknown>)[k] = msg;
                            hasAny = true;
                        }
                    }
                    if (hasAny) { setErrors(mapped); return; }
                }
            }

            // Check built-in validators
            for (const k in fields) if (fields[k].error.value) return;

            // All validations passed — call the callback
            const result = fn(currentValues);

            if (result instanceof Promise) {
                isSubmitting.value = true;

                result
                    .finally(() => {
                        isSubmitting.value = false;
                    })
                    .catch(() => { });
            }
        };
    }

    return {
        fields,
        values,
        errors,
        valid,
        dirty,
        touched,
        isSubmitting,
        submitCount,
        handleSubmit,
        reset,
        setErrors,
        dispose,
    };
}