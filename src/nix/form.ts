import { signal, computed, effect, batch } from "./reactivity";
import type { Signal } from "./reactivity";

// --- Validator ---

/**
 * A validator function. Return an error string when invalid, or `null` /
 * `undefined` when valid.
 *
 * `allValues` is provided when the validator runs inside `createForm`, enabling
 * cross-field validation (e.g., "confirm password matches password").
 *
 * **Validators must be pure.** They are invoked reactively whenever the field
 * value changes — potentially many times per keystroke in forms with
 * cross-field rules — and may run inside computed signals that assume
 * deterministic output. Do not perform I/O, mutate external state, or rely on
 * `Date.now()` / `Math.random()` inside a validator. For asynchronous checks
 * (uniqueness, server-side rules), submit the form and inject the result via
 * {@link FormState.setErrors}.
 */
export type Validator<T, AllValues = unknown> = (
    value: T,
    allValues?: AllValues,
) => string | null | undefined;

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

/** Creates a typed custom validator compatible with `nixField` and `createForm`. */
export function createValidator<T, AllValues = unknown>(
    fn: (value: T, allValues?: AllValues) => string | null | undefined
): Validator<T, AllValues> {
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
    /** Error visible según validateOn. Para UI. */
    readonly error: Signal<string | null>;
    /**
     * Error real, ignorando validateOn/touched/dirty.
     * Para lógica de habilitación de botones, validez global, etc.
     */
    readonly rawError: Signal<string | null>;
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
     * Set the field value programmatically.
     *
     * @param value — new value for the field.
     * @param options — control whether to touch/dirty the field and whether to force
     *   validation visibility.
     */
    setValue(
        value: T,
        options?: { shouldTouch?: boolean; shouldDirty?: boolean; shouldValidate?: boolean },
    ): void;
    /**
     * @internal — inject an external error message (server / schema validator).
     * The error clears automatically when the user next edits the field.
     */
    _setExternalError(msg: string | null): void;
    /** @internal — force error visibility (e.g., on submit). */
    _forceVisible(): void;
    /** @internal — update the stored initial value so a later reset() returns here. */
    _setInitialValue(value: T): void;
    /** @internal — dispose computed signals. */
    _dispose(): void;
}

// --- nixField ---

/** Creates a standalone reactive form field with optional validators. */
export function nixField<T, AllValues = unknown>(
    initialValue: T,
    fieldValidators: Validator<T, AllValues>[] = [],
    validateOn: ValidateOn = "blur",
    getAllValues?: () => AllValues,
): FieldState<T> {
    const value = signal(initialValue);
    const touched = signal(false);
    const dirty = signal(false);
    const _ext = signal<string | null>(null);
    // Tracks whether the form has been submitted at least once (injected externally)
    const _submitted = signal(false);
    // Mutable reference so that reset() can be redirected by createForm.reset(newValues).
    let currentInitialValue = initialValue;

    let _skipFirstClear = true;
    const _disposeExtCleanup = effect(() => {
        value.value; // subscribe to value changes
        if (_skipFirstClear) {
            _skipFirstClear = false;
            return;
        }
        if (_ext.peek() !== null) {
            _ext.value = null;
        }
    });

    const rawError = computed<string | null>(() => {
        if (_ext.value) return _ext.value;
        const allValues = getAllValues?.();
        for (const v of fieldValidators) {
            const e = v(value.value, allValues);
            if (e) return e;
        }
        return null;
    });

    const error = computed<string | null>(() => {
        const isVisible =
            validateOn === "input" ? dirty.value || touched.value :
                validateOn === "submit" ? _submitted.value :
                    touched.value;
        if (!isVisible) return null;
        return rawError.value;
    });

    function isCheckable(input: HTMLInputElement): boolean {
        return input.type === "checkbox" || input.type === "radio";
    }

    function coerce(target: EventTarget | null): T {
        if (!target || !("value" in target)) return initialValue;
        const t = target as HTMLInputElement;
        const value = t.value;

        if (typeof initialValue === "boolean") {
            const checked = t.checked;
            if (checked === true) return true as unknown as T;
            if (isCheckable(t)) return false as unknown as T;
            if (value === "true" || value === "1") return true as unknown as T;
            if (value === "false" || value === "0" || value === "") return false as unknown as T;
            return initialValue;
        }

        if (typeof initialValue === "number") {
            if (value === "") return NaN as unknown as T;
            return Number(value) as unknown as T;
        }

        return value as unknown as T;
    }

    const onInput = (e: Event): void => {
        value.value = coerce(e.target);
        dirty.value = true;
    };

    const onBlur = (): void => { touched.value = true; };

    function reset(): void {
        batch(() => {
            value.value = currentInitialValue;
            touched.value = false;
            dirty.value = false;
            _ext.value = null;
            _submitted.value = false;
        });
    }

    function setValue(
        next: T,
        options: { shouldTouch?: boolean; shouldDirty?: boolean; shouldValidate?: boolean } = {},
    ): void {
        const { shouldTouch = false, shouldDirty = true, shouldValidate = true } = options;
        batch(() => {
            value.value = next;
            if (shouldDirty) dirty.value = true;
            if (shouldTouch) touched.value = true;
            if (shouldValidate) _submitted.value = true;
        });
    }

    function _setExternalError(msg: string | null): void {
        _ext.value = msg;
        if (msg) touched.value = true;
    }

    function _forceVisible(): void {
        touched.value = true;
        _submitted.value = true;
    }

    function _setInitialValue(next: T): void {
        currentInitialValue = next;
    }

    function _dispose(): void {
        _disposeExtCleanup();
        error.dispose();
        rawError.dispose();
    }

    return { value, error, rawError, touched, dirty, onInput, onBlur, reset, setValue, _setExternalError, _forceVisible, _setInitialValue, _dispose };
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
    /** Replaces the whole array with a new list of items. */
    setValues(items: T[]): void;
    /** Patches existing items and appends any extras without touching untouched items. */
    patchValues(items: Partial<T>[]): void;
    /** Resets the array to its initial value, optionally updating that initial value. */
    reset(items?: T[]): void;
    /** @internal */
    _dispose(): void;
}

/**
 * Creates a reactive array of field groups for dynamic list forms.
 *
 * @example
 * const items = nixFieldArray([{ name: "" }], {
 *     name: [required()],
 * });
 * items.append({ name: "nuevo" });
 * items.remove(0);
 */
export function nixFieldArray<T extends Record<string, unknown>>(
    initialItems: T[],
    fieldValidators: { [K in keyof T]?: Validator<T[K], unknown>[] } = {},
    validateOn: ValidateOn = "blur",
): FieldArrayState<T> {
    function makeGroup(item: T): { [K in keyof T]: FieldState<T[K]> } {
        const group = {} as { [K in keyof T]: FieldState<T[K]> };
        for (const key in item) {
            const vs = (fieldValidators[key] ?? []) as Validator<T[typeof key], unknown>[];
            (group as Record<string, unknown>)[key] = nixField(item[key], vs, validateOn);
        }
        return group;
    }

    const fields = signal<Array<{ [K in keyof T]: FieldState<T[K]> }>>(
        initialItems.map(makeGroup)
    );
    // Mutable so that reset(newItems) can redirect the baseline.
    let currentInitialItems = initialItems;

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

    function setValues(items: T[]): void {
        for (const group of fields.value) {
            for (const key in group) group[key]._dispose();
        }
        fields.value = items.map(makeGroup);
    }

    function patchValues(items: Partial<T>[]): void {
        const current = [...fields.value];
        for (let i = 0; i < items.length; i++) {
            const patch = items[i] as Record<string, unknown>;
            if (i >= current.length) {
                current.push(makeGroup(patch as T));
                continue;
            }
            const group = current[i] as Record<string, FieldState<unknown>>;
            for (const [key, val] of Object.entries(patch)) {
                if (group[key]) {
                    group[key].setValue(val, { shouldDirty: false, shouldTouch: false, shouldValidate: false });
                }
            }
        }
        fields.value = current;
    }

    function reset(items?: T[]): void {
        if (items) currentInitialItems = items;
        for (const group of fields.value) {
            for (const key in group) group[key]._dispose();
        }
        fields.value = currentInitialItems.map(makeGroup);
    }

    function _dispose(): void {
        for (const group of fields.value) {
            for (const key in group) group[key]._dispose();
        }
        length.dispose();
    }

    return { fields, append, remove, move, replace, length, setValues, patchValues, reset, _dispose };
}

// --- FormState ---

/** Field-name map that supports top-level keys and dot-path nested keys. */
export type FormFields<T extends Record<string, unknown>> =
    { [K in keyof T]: FieldState<T[K]> } & Record<string, FieldState<unknown>>;

/** Map of field-name → error message for external validation results. */
export type FieldErrors<T extends Record<string, unknown>> =
    { [K in keyof T]?: string | null } & Record<string, string | null | undefined>;

/** Validators map supporting both top-level and dot-path keys. */
export type FormValidators<T extends Record<string, unknown>> =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { [K in keyof T]?: Validator<T[K], T>[] } & Record<string, Validator<any, any>[] | undefined>;

// Utility used by setValues so callers can patch nested objects (e.g. { address: { city: "Lima" } }).
export type DeepPartial<T> = T extends object ? { [P in keyof T]?: DeepPartial<T[P]> } : T;

export interface FormState<T extends Record<string, unknown>> {
    /** Individual field states — access value, error, event handlers. */
    fields: FormFields<T>;
    /** Computed snapshot of all current field values. */
    readonly values: Signal<T>;
    /** Computed map of all currently visible field errors. */
    readonly errors: Signal<FieldErrors<T>>;
    /**
     * True when no field has a *visible* error.
     *
     * Visibility follows `validateOn`, so this signal reflects what the user
     * currently sees in the UI — not the underlying validity of the data.
     * Use it to drive error summaries, banners, or any UI that should only
     * react to errors the user has been shown.
     *
     * For enabling or disabling submit buttons, use {@link canSubmit} instead.
     */
    readonly valid: Signal<boolean>;
    /**
     * True when every per-field validator passes against the current values,
     * regardless of `touched`, `dirty`, or `validateOn`.
     *
     * This is the signal to bind to submit buttons:
     *
     * ```ts
     * <button disabled=${() => !form.canSubmit.value || form.isSubmitting.value}>
     *   Save
     * </button>
     * ```
     *
     * Unlike {@link valid}, `canSubmit` does not depend on whether errors are
     * currently visible — a pristine form with empty required fields starts
     * as `false` and flips to `true` the moment all validators pass.
     *
     * External errors injected via {@link setErrors} also flip `canSubmit` to
     * `false` until the user edits the affected field.
     *
     * **Note:** `canSubmit` does not execute `options.validate` (schema-level
     * validators such as Zod). Schema validation runs only on submit, by design,
     * to keep per-keystroke cost predictable. If you need a schema rule to
     * affect `canSubmit` reactively, express it as a per-field validator in
     * `options.validators` instead.
     */
    readonly canSubmit: Signal<boolean>;
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
    /**
     * Reset all fields to their initial values. If `newInitialValues` is provided,
     * it becomes the new baseline and subsequent reset() calls will use it.
     */
    reset(newInitialValues?: T): void;
    /**
     * Set a single field value by its path (top-level or nested dot-path).
     */
    setValue(
        path: string,
        value: unknown,
        options?: { shouldTouch?: boolean; shouldDirty?: boolean; shouldValidate?: boolean },
    ): void;
    /**
     * Set multiple field values at once.
     *
     * @param values — partial object with top-level and/or nested values.
     * @param options — control whether to preserve existing touched/dirty/error state.
     */
    setValues(
        values: DeepPartial<T>,
        options?: { keepDirty?: boolean; keepTouched?: boolean; keepErrors?: boolean },
    ): void;
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
    /** Per-field validators. Each validator receives `(value, allValues?)`. */
    validators?: FormValidators<T>;
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
    ) => Record<string, string | string[] | null | undefined> | null | undefined;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flattenValuePaths(
    value: Record<string, unknown>,
    prefix = "",
    out: Array<[string, unknown]> = [],
): Array<[string, unknown]> {
    for (const [key, next] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${key}` : key;
        if (isPlainRecord(next) && Object.keys(next).length > 0) {
            flattenValuePaths(next, path, out);
            continue;
        }
        out.push([path, next]);
    }
    return out;
}

function setAtPath(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".");
    let current: Record<string, unknown> = target;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const child = current[part];
        if (!isPlainRecord(child)) {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
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

    const fields = {} as Record<string, FieldState<unknown>>;
    const validatorsByPath = options.validators as
        | Record<string, Validator<unknown, T>[] | undefined>
        | undefined;

    function snapshotValues(): T {
        const r: Record<string, unknown> = {};
        for (const k in fields) setAtPath(r, k, fields[k].value.value);
        return r as T;
    }

    for (const [path, initialValue] of flattenValuePaths(initialValues)) {
        const vs = validatorsByPath?.[path] ?? [];
        fields[path] = nixField<unknown, T>(initialValue, vs, validateOn, snapshotValues);
    }

    const isSubmitting = signal(false);
    const submitCount = signal(0);

    const values = computed<T>(() => {
        return snapshotValues();
    });

    const errors = computed<FieldErrors<T>>(() => {
        const r: FieldErrors<T> = {};
        for (const k in fields) {
            const e = fields[k].error.value;
            if (e) (r as Record<string, unknown>)[k] = e;
        }
        return r;
    });

    const canSubmit = computed<boolean>(() => {
        for (const k in fields) {
            if (fields[k].rawError.value) return false;
        }
        return true;
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

    function setValue(
        path: string,
        value: unknown,
        options: { shouldTouch?: boolean; shouldDirty?: boolean; shouldValidate?: boolean } = {},
    ): void {
        const field = fields[path];
        if (!field) return;
        field.setValue(value, options);
    }

    function setValues(
        values: DeepPartial<T>,
        options: { keepDirty?: boolean; keepTouched?: boolean; keepErrors?: boolean } = {},
    ): void {
        const { keepDirty = false, keepTouched = false, keepErrors = true } = options;
        batch(() => {
            for (const [path, v] of flattenValuePaths(values as Record<string, unknown>)) {
                const field = fields[path];
                if (!field) continue;
                field.setValue(v, {
                    shouldDirty: !keepDirty,
                    shouldTouch: false,
                    shouldValidate: !keepErrors,
                });
                if (!keepTouched) field.touched.value = false;
            }
        });
    }

    function reset(newInitialValues?: T): void {
        if (newInitialValues) {
            for (const [path, v] of flattenValuePaths(newInitialValues)) {
                const field = fields[path];
                if (field) field._setInitialValue(v);
            }
        }
        for (const k in fields) fields[k].reset();
        isSubmitting.value = false;
        submitCount.value = 0;
    }

    function dispose(): void {
        values.dispose();
        errors.dispose();
        canSubmit.dispose();
        valid.dispose();
        dirty.dispose();
        touched.dispose();
        for (const k in fields) fields[k]._dispose();
    }

    function handleSubmit(fn: (values: T) => void | Promise<void>) {
        return (e: Event): void => {
            e.preventDefault();

            submitCount.value++;

            for (const k in fields) fields[k]._forceVisible();

            const currentValues = values.value;

            // Run schema-level validator (Zod, Valibot, etc.)
            if (options.validate) {
                const ext = options.validate(currentValues);
                if (ext) {
                    const mapped: FieldErrors<T> = {};
                    let hasAny = false;
                    for (const k in ext) {
                        const v = ext[k];
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
            for (const k in fields) if (fields[k].rawError.value) return;

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
        fields: fields as FormFields<T>,
        values,
        errors,
        canSubmit,
        valid,
        dirty,
        touched,
        isSubmitting,
        submitCount,
        handleSubmit,
        reset,
        setValue,
        setValues,
        setErrors,
        dispose,
    };
}