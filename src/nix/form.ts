// ═══════════════════════════════════════════════
//  Nix.js ❄️ — Forms  (Fase 15)
// ═══════════════════════════════════════════════
//
//  Two levels:
//
//    useField(initial, validators?)     — standalone reactive field
//    createForm(initialValues, options) — full form with submit +
//                                         external validator support
//                                         (Zod, Valibot, Yup, custom…)
//
//  Built-in validators (also available as a grouped namespace):
//    required()  minLength(n)  maxLength(n)
//    email()     pattern(re)  min(n)  max(n)
//
//  Custom validator API:
//    createValidator<T>(fn)               — define a typed custom rule
//    validators                           — grouped namespace object
//    extendValidators(validators, {...})  — merge custom rules into the namespace

import { signal, computed } from "./reactivity";
import type { Signal } from "./reactivity";

// ─── Validator ────────────────────────────────────────────────────────────────

/** A validator function. Return an error string, or null/undefined if valid. */
export type Validator<T> = (value: T) => string | null | undefined;

// ─── Built-in validators ──────────────────────────────────────────────────────

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

// ─── Custom validator API ─────────────────────────────────────────────────────

/**
 * Creates a typed custom validator, fully compatible with `useField` and
 * `createForm`. The preferred way to define your own rules without importing
 * the `Validator<T>` type manually.
 *
 * @example Simple rule
 * ```typescript
 * const noSpaces = createValidator<string>((v) =>
 *   v.includes(" ") ? "No spaces allowed" : null
 * );
 *
 * useField("", [noSpaces]);
 * ```
 *
 * @example Configurable rule (same pattern as built-ins)
 * ```typescript
 * const phone = (msg = "Invalid phone number") =>
 *   createValidator<string>((v) =>
 *     /^\+?\d{7,15}$/.test(v) ? null : msg
 *   );
 *
 * useField("", [phone()]);
 * useField("", [phone("Enter your mobile number")]);
 * ```
 */
export function createValidator<T>(
    fn: (value: T) => string | null | undefined
): Validator<T> {
    return fn;
}

/**
 * All built-in validators grouped as a namespace object.
 *
 * Use this when you prefer `validators.required()` over individual named
 * imports. Combine with `extendValidators` to add your own rules.
 *
 * @example
 * ```typescript
 * import { validators } from "@deijose/nix-js";
 *
 * createForm(
 *   { name: "", email: "", age: 0 },
 *   {
 *     validators: {
 *       name:  [validators.required(), validators.minLength(2)],
 *       email: [validators.required(), validators.email()],
 *       age:   [validators.required(), validators.min(18)],
 *     },
 *   }
 * );
 * ```
 */
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
 * Merges your own validator factories into the `validators` namespace, returning
 * a fully typed object that includes both built-ins and custom rules.
 *
 * The original `validators` object is **never mutated** — a new object is returned.
 *
 * @example
 * ```typescript
 * import { validators, extendValidators, createValidator } from "@deijose/nix-js";
 *
 * const myValidators = extendValidators(validators, {
 *   // Configurable rule (custom message support)
 *   phone: (msg = "Invalid phone number") =>
 *     createValidator<string>((v) => /^\+?\d{7,15}$/.test(v) ? null : msg),
 *
 *   // Rule reusing a built-in internally
 *   slug: (msg = "Only lowercase letters, numbers and hyphens") =>
 *     createValidator<string>((v) =>
 *       /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) ? null : msg
 *     ),
 * });
 *
 * // IDE auto-complete covers built-ins and custom rules alike:
 * myValidators.required()        // ✅ built-in
 * myValidators.email()           // ✅ built-in
 * myValidators.phone()           // ✅ custom
 * myValidators.slug("Bad slug")  // ✅ custom, custom message
 *
 * // Use in a form like any other validators:
 * createForm(
 *   { phone: "", slug: "" },
 *   {
 *     validators: {
 *       phone: [myValidators.required(), myValidators.phone()],
 *       slug:  [myValidators.required(), myValidators.slug()],
 *     },
 *   }
 * );
 * ```
 *
 * @param base       The base validators namespace (pass `validators`).
 * @param extensions An object whose values are validator factory functions.
 * @returns          A new merged namespace object.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extendValidators<E extends Record<string, (...args: any[]) => Validator<any>>>(
    base: ValidatorsBase,
    extensions: E
): ValidatorsBase & E {
    return { ...base, ...extensions };
}

// ─── FieldState ───────────────────────────────────────────────────────────────

/** Public state of a single form field. */
export interface FieldState<T> {
    /** Current value — read/write signal. */
    value: Signal<T>;
    /**
     * Current error message, or null.
     * Only non-null after the field has been touched (blur) or dirtied (input).
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
}

// ─── useField ─────────────────────────────────────────────────────────────────

/**
 * Creates a standalone reactive form field with optional validators.
 *
 * @example
 * const name = useField("", [required(), minLength(2)]);
 *
 * html`
 *   <input value=${() => name.value.value}
 *          @input=${name.onInput}
 *          @blur=${name.onBlur} />
 *   ${() => name.error.value
 *     ? html`<p class="err">${name.error.value}</p>`
 *     : null}
 * `
 */
export function useField<T>(
    initialValue: T,
    validators: Validator<T>[] = []
): FieldState<T> {
    const value = signal(initialValue);
    const touched = signal(false);
    const dirty = signal(false);
    const _ext = signal<string | null>(null);

    // Computed error: external override takes priority, then built-in validators.
    // Errors are hidden until the field is touched or dirty.
    const error = computed<string | null>(() => {
        if (_ext.value) return _ext.value;
        if (!touched.value && !dirty.value) return null;
        for (const v of validators) {
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
        _ext.value = null; // clear server-side error when user re-types
    };

    const onBlur = (): void => { touched.value = true; };

    function reset(): void {
        value.value = initialValue;
        touched.value = false;
        dirty.value = false;
        _ext.value = null;
    }

    function _setExternalError(msg: string | null): void {
        _ext.value = msg;
        if (msg) touched.value = true; // force error visibility
    }

    return { value, error, touched, dirty, onInput, onBlur, reset, _setExternalError };
}

// ─── FormState ────────────────────────────────────────────────────────────────

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
    /**
     * Wraps a submit callback. Returned handler:
     * 1. Calls `e.preventDefault()`
     * 2. Touches all fields (revealing validation errors)
     * 3. Runs `options.validate` if provided (Zod, etc.)
     * 4. Only calls `fn(values)` if all validations pass
     */
    handleSubmit(fn: (values: T) => void | Promise<void>): (e: Event) => void;
    /** Reset all fields to their initial values. */
    reset(): void;
    /**
     * Inject external errors (e.g., from a server response) into specific fields.
     * Each field's error clears automatically the next time the user edits it.
     *
     * @example
     * form.setErrors({ email: "Email already in use" });
     */
    setErrors(errors: FieldErrors<T>): void;
}

export interface FormOptions<T extends Record<string, unknown>> {
    /** Per-field built-in validators. */
    validators?: { [K in keyof T]?: Validator<T[K]>[] };
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
     *
     * @example Valibot interop
     * ```typescript
     * validate(values) {
     *   const r = safeParse(schema, values);
     *   if (r.success) return null;
     *   const errs: Record<string, string> = {};
     *   for (const issue of r.issues)
     *     if (issue.path?.[0]?.key) errs[issue.path[0].key as string] = issue.message;
     *   return errs;
     * }
     * ```
     */
    validate?: (
        values: T
    ) => { [K in keyof T]?: string | string[] | null | undefined } | null | undefined;
}

// ─── createForm ───────────────────────────────────────────────────────────────

/**
 * Creates a managed form with reactive fields, built-in validation,
 * schema-level validation (Zod / Valibot / Yup / custom), and submit handling.
 *
 * @example
 * const form = createForm(
 *   { name: "", email: "", age: 0 },
 *   {
 *     validators: {
 *       name:  [required(), minLength(2)],
 *       email: [required(), email()],
 *       age:   [required(), min(18)],
 *     },
 *   }
 * );
 *
 * html`
 *   <form @submit=${form.handleSubmit(onSubmit)}>
 *     <input value=${() => form.fields.name.value.value}
 *            @input=${form.fields.name.onInput}
 *            @blur=${form.fields.name.onBlur} />
 *     ${() => form.fields.name.error.value
 *       ? html`<p class="err">${form.fields.name.error.value}</p>`
 *       : null}
 *     <button type="submit">Submit</button>
 *   </form>
 * `
 */
export function createForm<T extends Record<string, unknown>>(
    initialValues: T,
    options: FormOptions<T> = {}
): FormState<T> {
    const fields = {} as { [K in keyof T]: FieldState<T[K]> };
    for (const key in initialValues) {
        const validators = (options.validators?.[key] ?? []) as Validator<T[typeof key]>[];
        (fields as Record<string, unknown>)[key] = useField(initialValues[key], validators);
    }

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

    function setErrors(errs: FieldErrors<T>): void {
        for (const k in errs) fields[k]?._setExternalError(errs[k] ?? null);
    }

    function reset(): void {
        for (const k in fields) fields[k].reset();
    }

    function handleSubmit(fn: (values: T) => void | Promise<void>) {
        return (e: Event): void => {
            e.preventDefault();

            // Touch all fields so validators become visible
            for (const k in fields) fields[k].touched.value = true;

            const currentValues = values.value;

            // Run schema-level validator (Zod, Valibot, etc.) first
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

            // Check built-in validators (already computed via touched=true)
            for (const k in fields) if (fields[k].error.value) return;

            fn(currentValues);
        };
    }

    return { fields, values, errors, valid, dirty, handleSubmit, reset, setErrors };
}
