import { describe, it, expect, vi } from "vitest";
import {
    nixField,
    nixFieldArray,
    createForm,
    required,
    minLength,
    maxLength,
    pattern,
    email,
    min,
    max,
    createValidator,
    validators,
    extendValidators,
} from "../nix/form";
import { effect } from "../nix/reactivity";

// ── Validators ────────────────────────────────────────────────────────────────

describe("validators", () => {
    it("required() fails on empty string, null, undefined, empty array", () => {
        const v = required();
        expect(v("")).toBeTruthy();
        expect(v(null)).toBeTruthy();
        expect(v(undefined)).toBeTruthy();
        expect(v([])).toBeTruthy();
        expect(v("a")).toBeNull();
        expect(v(0)).toBeNull();
    });

    it("required() supports custom message", () => {
        const v = required("Campo obligatorio");
        expect(v("")).toBe("Campo obligatorio");
    });

    it("minLength(n) validates string length", () => {
        const v = minLength(3);
        expect(v("ab")).toBeTruthy();
        expect(v("abc")).toBeNull();
        expect(v("abcd")).toBeNull();
    });

    it("maxLength(n) validates string length", () => {
        const v = maxLength(3);
        expect(v("abcd")).toBeTruthy();
        expect(v("abc")).toBeNull();
        expect(v("ab")).toBeNull();
    });

    it("pattern(regex) validates against regex", () => {
        const v = pattern(/^\d+$/);
        expect(v("123")).toBeNull();
        expect(v("abc")).toBeTruthy();
    });

    it("email() validates email format", () => {
        const v = email();
        expect(v("test@example.com")).toBeNull();
        expect(v("invalid")).toBeTruthy();
        expect(v("@no-user.com")).toBeTruthy();
    });

    it("min(n) validates number >= n", () => {
        const v = min(10);
        expect(v(10)).toBeNull();
        expect(v(11)).toBeNull();
        expect(v(9)).toBeTruthy();
    });

    it("max(n) validates number <= n", () => {
        const v = max(10);
        expect(v(10)).toBeNull();
        expect(v(9)).toBeNull();
        expect(v(11)).toBeTruthy();
    });

    it("createValidator creates a typed custom validator", () => {
        const noSpaces = createValidator<string>((v) =>
            v.includes(" ") ? "No spaces" : null
        );
        expect(noSpaces("hello world")).toBe("No spaces");
        expect(noSpaces("hello")).toBeNull();
    });

    it("createValidator supports full-form values as second argument", () => {
        const matchesPass = createValidator<string, { pass: string }>((v, values) =>
            v !== values?.pass ? "Must match" : null
        );

        expect(matchesPass("123", { pass: "456" })).toBe("Must match");
        expect(matchesPass("123", { pass: "123" })).toBeNull();
    });

    it("validators namespace contains all built-ins", () => {
        expect(typeof validators.required).toBe("function");
        expect(typeof validators.minLength).toBe("function");
        expect(typeof validators.maxLength).toBe("function");
        expect(typeof validators.email).toBe("function");
        expect(typeof validators.pattern).toBe("function");
        expect(typeof validators.min).toBe("function");
        expect(typeof validators.max).toBe("function");
    });

    it("extendValidators merges custom rules", () => {
        const extended = extendValidators(validators, {
            phone: (msg = "Invalid") => createValidator<string>((v) =>
                /^\d{10}$/.test(v) ? null : msg
            ),
        });
        expect(typeof extended.phone).toBe("function");
        expect(typeof extended.required).toBe("function");
        expect(extended.phone()("1234567890")).toBeNull();
        expect(extended.phone()("short")).toBe("Invalid");
    });
});

// ── nixField ──────────────────────────────────────────────────────────────────

describe("nixField", () => {
    it("initializes with given value", () => {
        const f = nixField("hello");
        expect(f.value.value).toBe("hello");
    });

    it("starts untouched and not dirty", () => {
        const f = nixField("");
        expect(f.touched.value).toBe(false);
        expect(f.dirty.value).toBe(false);
    });

    it("error is null before touched/dirty", () => {
        const f = nixField("", [required()]);
        expect(f.error.value).toBeNull();
    });

    it("shows error after touched", () => {
        const f = nixField("", [required()]);
        f.onBlur();
        expect(f.error.value).toBe("Required");
    });

    it("shows error after dirty via onInput", () => {
        const f = nixField("hello", [minLength(10)], "input");
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "hi" } });
        f.onInput(event);
        expect(f.dirty.value).toBe(true);
        expect(f.error.value).toBeTruthy();
    });

    it("reset() restores initial state", () => {
        const f = nixField("abc", [required()]);
        (f.value as { value: string }).value = "changed";
        f.touched.value = true;
        f.dirty.value = true;
        f.reset();
        expect(f.value.value).toBe("abc");
        expect(f.touched.value).toBe(false);
        expect(f.dirty.value).toBe(false);
    });

    it("_setExternalError injects server-side error", () => {
        const f = nixField("test");
        f._setExternalError("Email taken");
        expect(f.error.value).toBe("Email taken");
        expect(f.touched.value).toBe(true);
    });

    it("external error clears on next input", () => {
        const f = nixField("test");
        f._setExternalError("Server error");
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "new" } });
        f.onInput(event);
        expect(f.error.value).toBeNull();
    });

    it("coerce handles non-input event targets gracefully", () => {
        const field = nixField("default");
        const fakeEvent = { target: document.createElement("div") } as unknown as Event;
        field.onInput(fakeEvent);
        expect(field.value.value).toBe("default");
    });

    it("coerce handles null event target gracefully", () => {
        const field = nixField("fallback");
        const fakeEvent = { target: null } as unknown as Event;
        field.onInput(fakeEvent);
        expect(field.value.value).toBe("fallback");
    });

    it("coerce number returns NaN for empty input", () => {
        const field = nixField(0);
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "" } });
        field.onInput(event);
        expect(Number.isNaN(field.value.value)).toBe(true);
    });

    it("coerce number parses numeric input", () => {
        const field = nixField(0);
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "42" } });
        field.onInput(event);
        expect(field.value.value).toBe(42);
    });

    it("coerce boolean uses checked for checkbox", () => {
        const field = nixField(false);
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "on", checked: true, type: "checkbox" } });
        field.onInput(event);
        expect(field.value.value).toBe(true);
    });

    it("coerce boolean uses checked for radio", () => {
        const field = nixField(true);
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "on", checked: false, type: "radio" } });
        field.onInput(event);
        expect(field.value.value).toBe(false);
    });

    it("coerce boolean parses string values for select", () => {
        const field = nixField(true);
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "false" } });
        field.onInput(event);
        expect(field.value.value).toBe(false);
    });
});

// ── nixField — validateOn ─────────────────────────────────────────────────────

describe("nixField — validateOn", () => {
    describe('validateOn: "blur" (default)', () => {
        it("does not show error before blur", () => {
            const f = nixField("", [required()], "blur");
            expect(f.error.value).toBeNull();
        });

        it("shows error after blur", () => {
            const f = nixField("", [required()], "blur");
            f.onBlur();
            expect(f.error.value).toBeTruthy();
        });

        it("does not show error after input only (no blur)", () => {
            const f = nixField("ok", [minLength(10)], "blur");
            const event = new Event("input");
            Object.defineProperty(event, "target", { value: { value: "hi" } });
            f.onInput(event);
            // dirty=true but touched=false → no error with "blur" mode
            expect(f.error.value).toBeNull();
        });
    });

    describe('validateOn: "input"', () => {
        it("does not show error before any interaction", () => {
            const f = nixField("", [required()], "input");
            expect(f.error.value).toBeNull();
        });

        it("shows error immediately after input", () => {
            const f = nixField("ok", [minLength(10)], "input");
            const event = new Event("input");
            Object.defineProperty(event, "target", { value: { value: "hi" } });
            f.onInput(event);
            expect(f.error.value).toBeTruthy();
        });

        it("shows error after blur too", () => {
            const f = nixField("", [required()], "input");
            f.onBlur();
            expect(f.error.value).toBeTruthy();
        });

        it("clears error when value becomes valid", () => {
            const f = nixField("", [required()], "input");
            // First input: invalid
            const bad = new Event("input");
            Object.defineProperty(bad, "target", { value: { value: "" } });
            f.onInput(bad);
            expect(f.error.value).toBeTruthy();
            // Second input: valid
            const good = new Event("input");
            Object.defineProperty(good, "target", { value: { value: "valid" } });
            f.onInput(good);
            expect(f.error.value).toBeNull();
        });
    });

    describe('validateOn: "submit"', () => {
        it("does not show error before submit, even after blur and input", () => {
            const f = nixField("", [required()], "submit");
            f.onBlur();
            const event = new Event("input");
            Object.defineProperty(event, "target", { value: { value: "" } });
            f.onInput(event);
            expect(f.error.value).toBeNull();
        });

        it("shows error after _forceVisible()", () => {
            const f = nixField("", [required()], "submit");
            f._forceVisible();
            expect(f.error.value).toBeTruthy();
        });

        it("reset() clears _submitted flag — error hidden again", () => {
            const f = nixField("", [required()], "submit");
            f._forceVisible();
            expect(f.error.value).toBeTruthy();
            f.reset();
            expect(f.error.value).toBeNull();
        });
    });
});

// ── createForm ────────────────────────────────────────────────────────────────

describe("createForm", () => {
    it("creates fields for each initial value", () => {
        const form = createForm({ name: "", age: 0 });
        expect(form.fields.name.value.value).toBe("");
        expect(form.fields.age.value.value).toBe(0);
    });

    it("values computed signal reflects all field values", () => {
        const form = createForm({ x: "a", y: "b" });
        expect(form.values.value).toEqual({ x: "a", y: "b" });
        form.fields.x.value.value = "changed";
        expect(form.values.value.x).toBe("changed");
    });

    it("valid is true when no visible errors", () => {
        const form = createForm({ name: "" }, { validators: { name: [required()] } });
        expect(form.valid.value).toBe(true);
    });

    it("valid becomes false after touching an invalid field", () => {
        const form = createForm({ name: "" }, { validators: { name: [required()] } });
        form.fields.name.onBlur();
        expect(form.valid.value).toBe(false);
    });

    it("dirty tracks if any field has been modified", () => {
        const form = createForm({ a: "", b: "" });
        expect(form.dirty.value).toBe(false);
        form.fields.a.dirty.value = true;
        expect(form.dirty.value).toBe(true);
    });

    it("reset() restores all fields", () => {
        const form = createForm({ name: "init" });
        form.fields.name.value.value = "changed";
        form.fields.name.dirty.value = true;
        form.reset();
        expect(form.fields.name.value.value).toBe("init");
        expect(form.fields.name.dirty.value).toBe(false);
    });

    it("setErrors injects external errors into fields", () => {
        const form = createForm({ email: "", password: "" });
        form.setErrors({ email: "Already taken" });
        expect(form.fields.email.error.value).toBe("Already taken");
    });

    it("handleSubmit validates and calls fn when valid", () => {
        const fn = vi.fn();
        const form = createForm({ name: "John" });
        const handler = form.handleSubmit(fn);
        const event = new Event("submit");
        event.preventDefault = vi.fn();
        handler(event);
        expect(fn).toHaveBeenCalledWith({ name: "John" });
    });

    it("handleSubmit does not call fn when invalid", () => {
        const fn = vi.fn();
        const form = createForm(
            { name: "" },
            { validators: { name: [required()] } }
        );
        const handler = form.handleSubmit(fn);
        const event = new Event("submit");
        event.preventDefault = vi.fn();
        handler(event);
        expect(fn).not.toHaveBeenCalled();
    });

    it("handleSubmit runs schema-level validate", () => {
        const fn = vi.fn();
        const form = createForm(
            { password: "short" },
            {
                validate: (values) => {
                    if (values.password.length < 8) return { password: "Too short" };
                    return null;
                },
            }
        );
        const handler = form.handleSubmit(fn);
        const event = new Event("submit");
        event.preventDefault = vi.fn();
        handler(event);
        expect(fn).not.toHaveBeenCalled();
        expect(form.fields.password.error.value).toBe("Too short");
    });

    it("errors computed includes all visible errors", () => {
        const form = createForm(
            { a: "", b: "" },
            { validators: { a: [required()], b: [required()] } }
        );
        form.fields.a.onBlur();
        form.fields.b.onBlur();
        const errs = form.errors.value;
        expect(errs.a).toBeTruthy();
        expect(errs.b).toBeTruthy();
    });

    it("supports nested dot-path fields", () => {
        const form = createForm(
            { name: "", address: { city: "", zip: "" } },
            {
                validators: {
                    "address.city": [required()],
                },
            },
        );

        expect(form.fields.name.value.value).toBe("");
        expect(form.fields["address.city"].value.value).toBe("");
        expect(form.fields["address.zip"].value.value).toBe("");

        form.fields["address.city"].onBlur();
        expect(form.fields["address.city"].error.value).toBe("Required");

        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "Lima" } });
        form.fields["address.city"].onInput(event);

        expect(form.values.value.address.city).toBe("Lima");
        expect(form.values.value.address.zip).toBe("");
    });

    it("setErrors accepts dot-path keys", () => {
        const form = createForm({ address: { city: "", zip: "" } });
        form.setErrors({ "address.city": "City is required" });
        expect(form.fields["address.city"].error.value).toBe("City is required");
    });

    it("supports cross-field password confirmation validators", () => {
        const form = createForm(
            { pass: "", confirm: "" },
            {
                validateOn: "input",
                validators: {
                    confirm: [
                        (v, values) => v !== values?.pass ? "Must match" : null,
                    ],
                },
            },
        );

        const passEvent = new Event("input");
        Object.defineProperty(passEvent, "target", { value: { value: "secret123" } });
        form.fields.pass.onInput(passEvent);

        const confirmBad = new Event("input");
        Object.defineProperty(confirmBad, "target", { value: { value: "other" } });
        form.fields.confirm.onInput(confirmBad);
        expect(form.fields.confirm.error.value).toBe("Must match");

        const confirmGood = new Event("input");
        Object.defineProperty(confirmGood, "target", { value: { value: "secret123" } });
        form.fields.confirm.onInput(confirmGood);
        expect(form.fields.confirm.error.value).toBeNull();
    });

    it("revalidates dependent fields when the source field changes", () => {
        const form = createForm(
            { pass: "", confirm: "" },
            {
                validateOn: "input",
                validators: {
                    confirm: [
                        (v, values) => v !== values?.pass ? "Must match" : null,
                    ],
                },
            },
        );

        const pass1 = new Event("input");
        Object.defineProperty(pass1, "target", { value: { value: "abc" } });
        form.fields.pass.onInput(pass1);

        const confirm = new Event("input");
        Object.defineProperty(confirm, "target", { value: { value: "abc" } });
        form.fields.confirm.onInput(confirm);
        expect(form.fields.confirm.error.value).toBeNull();

        const pass2 = new Event("input");
        Object.defineProperty(pass2, "target", { value: { value: "xyz" } });
        form.fields.pass.onInput(pass2);

        expect(form.fields.confirm.error.value).toBe("Must match");
    });

    it("supports cross-field date range validation", () => {
        const form = createForm(
            { start: "2026-01-10", end: "" },
            {
                validateOn: "input",
                validators: {
                    end: [
                        (v, values) => !v || v >= (values?.start ?? "") ? null : "End date must be after start date",
                    ],
                },
            },
        );

        const badEnd = new Event("input");
        Object.defineProperty(badEnd, "target", { value: { value: "2026-01-05" } });
        form.fields.end.onInput(badEnd);
        expect(form.fields.end.error.value).toBe("End date must be after start date");

        const goodEnd = new Event("input");
        Object.defineProperty(goodEnd, "target", { value: { value: "2026-01-12" } });
        form.fields.end.onInput(goodEnd);
        expect(form.fields.end.error.value).toBeNull();
    });

    it("supports conditional required validators", () => {
        const form = createForm(
            { isBusiness: false, companyName: "" },
            {
                validateOn: "input",
                validators: {
                    companyName: [
                        (v, values) => values?.isBusiness && !v ? "Company is required" : null,
                    ],
                },
            },
        );

        const companyTouched = new Event("input");
        Object.defineProperty(companyTouched, "target", { value: { value: "" } });
        form.fields.companyName.onInput(companyTouched);
        expect(form.fields.companyName.error.value).toBeNull();

        const businessOn = new Event("input");
        Object.defineProperty(businessOn, "target", { value: { value: "on", checked: true } });
        form.fields.isBusiness.onInput(businessOn);

        expect(form.fields.companyName.error.value).toBe("Company is required");
    });
});

// ── createForm — touched (global) ─────────────────────────────────────────────

describe("createForm — form.touched", () => {
    it("is false when no field has been touched", () => {
        const form = createForm({ a: "", b: "" });
        expect(form.touched.value).toBe(false);
    });

    it("is true after any field is touched", () => {
        const form = createForm({ a: "", b: "" });
        form.fields.a.onBlur();
        expect(form.touched.value).toBe(true);
    });

    it("goes back to false after reset()", () => {
        const form = createForm({ a: "" });
        form.fields.a.onBlur();
        expect(form.touched.value).toBe(true);
        form.reset();
        expect(form.touched.value).toBe(false);
    });
});

// ── createForm — submitCount ──────────────────────────────────────────────────

describe("createForm — submitCount", () => {
    it("starts at 0", () => {
        const form = createForm({ name: "" });
        expect(form.submitCount.value).toBe(0);
    });

    it("increments on each submit attempt (including failed ones)", () => {
        const form = createForm(
            { name: "" },
            { validators: { name: [required()] } }
        );
        const handler = form.handleSubmit(vi.fn());
        const event = new Event("submit");
        event.preventDefault = vi.fn();
        handler(event); // fails validation
        expect(form.submitCount.value).toBe(1);
        handler(event); // fails again
        expect(form.submitCount.value).toBe(2);
    });

    it("increments on successful submit too", () => {
        const form = createForm({ name: "John" });
        const handler = form.handleSubmit(vi.fn());
        const event = new Event("submit");
        event.preventDefault = vi.fn();
        handler(event);
        expect(form.submitCount.value).toBe(1);
    });

    it("reset() sets submitCount back to 0", () => {
        const form = createForm({ name: "John" });
        const handler = form.handleSubmit(vi.fn());
        const event = new Event("submit");
        event.preventDefault = vi.fn();
        handler(event);
        handler(event);
        form.reset();
        expect(form.submitCount.value).toBe(0);
    });
});

// ── createForm — isSubmitting ─────────────────────────────────────────────────

describe("createForm — isSubmitting", () => {
    it("starts as false", () => {
        const form = createForm({ name: "" });
        expect(form.isSubmitting.value).toBe(false);
    });

    it("stays false for synchronous submit callbacks", () => {
        const form = createForm({ name: "John" });
        const handler = form.handleSubmit(() => { /* sync */ });
        const event = new Event("submit");
        event.preventDefault = vi.fn();
        handler(event);
        expect(form.isSubmitting.value).toBe(false);
    });

    it("is true while async callback is pending, false after resolving", async () => {
        let resolve!: () => void;
        const asyncFn = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
        const form = createForm({ name: "John" });
        const handler = form.handleSubmit(asyncFn);
        const event = new Event("submit");
        event.preventDefault = vi.fn();

        handler(event);
        expect(form.isSubmitting.value).toBe(true);

        resolve();
        await Promise.resolve(); // flush microtasks
        expect(form.isSubmitting.value).toBe(false);
    });

    it("is false after async callback rejects", async () => {
        let reject!: (e: unknown) => void;
        const asyncFn = vi.fn(() => new Promise<void>((_, r) => { reject = r; }));
        const form = createForm({ name: "John" });
        const handler = form.handleSubmit(asyncFn);
        const event = new Event("submit");
        event.preventDefault = vi.fn();

        handler(event);
        expect(form.isSubmitting.value).toBe(true);

        reject(new Error("server error"));
        await Promise.resolve();
        expect(form.isSubmitting.value).toBe(false);
    });

    it("reset() forces isSubmitting to false", async () => {
        let resolve!: () => void;
        const asyncFn = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
        const form = createForm({ name: "John" });
        const handler = form.handleSubmit(asyncFn);
        const event = new Event("submit");
        event.preventDefault = vi.fn();

        handler(event);
        expect(form.isSubmitting.value).toBe(true);
        form.reset();
        expect(form.isSubmitting.value).toBe(false);
        resolve(); // cleanup — prevent unhandled rejection
    });
});

// ── createForm — validateOn ───────────────────────────────────────────────────

describe('createForm — validateOn: "submit"', () => {
    it("does not show errors before submit even if fields are touched", () => {
        const form = createForm(
            { name: "" },
            { validators: { name: [required()] }, validateOn: "submit" }
        );
        form.fields.name.onBlur();
        expect(form.fields.name.error.value).toBeNull();
    });

    it("shows errors after handleSubmit is called", () => {
        const form = createForm(
            { name: "" },
            { validators: { name: [required()] }, validateOn: "submit" }
        );
        const handler = form.handleSubmit(vi.fn());
        const event = new Event("submit");
        event.preventDefault = vi.fn();
        handler(event);
        expect(form.fields.name.error.value).toBeTruthy();
    });
});

describe('createForm — validateOn: "input"', () => {
    it("shows errors immediately on input", () => {
        const form = createForm(
            { name: "" },
            { validators: { name: [required()] }, validateOn: "input" }
        );
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "" } });
        form.fields.name.onInput(event);
        expect(form.fields.name.error.value).toBeTruthy();
    });
});

// ── createForm — dispose ──────────────────────────────────────────────────────

describe("createForm — dispose()", () => {
    it("dispose() does not throw", () => {
        const form = createForm({ name: "", age: 0 });
        expect(() => form.dispose()).not.toThrow();
    });

    it("after dispose(), signals no longer update computed values", () => {
        const form = createForm({ name: "John" });
        const snapBefore = form.values.value.name;
        form.dispose();
        // Mutating a field signal after dispose should not crash
        expect(() => { form.fields.name.value.value = "Jane"; }).not.toThrow();
        // The computed is disposed — it won't re-run; value stays stale
        expect(snapBefore).toBe("John");
    });
});

// ── nixFieldArray ─────────────────────────────────────────────────────────────

describe("nixFieldArray", () => {
    it("initializes with the given items", () => {
        const arr = nixFieldArray([{ name: "a" }, { name: "b" }]);
        expect(arr.fields.value).toHaveLength(2);
        expect(arr.fields.value[0].name.value.value).toBe("a");
        expect(arr.fields.value[1].name.value.value).toBe("b");
    });

    it("length signal reflects the current count", () => {
        const arr = nixFieldArray([{ name: "x" }]);
        expect(arr.length.value).toBe(1);
    });

    it("starts with empty array when initialItems is empty", () => {
        const arr = nixFieldArray<{ name: string }>([]);
        expect(arr.fields.value).toHaveLength(0);
        expect(arr.length.value).toBe(0);
    });

    describe("append()", () => {
        it("adds a new group at the end", () => {
            const arr = nixFieldArray([{ name: "a" }]);
            arr.append({ name: "b" });
            expect(arr.fields.value).toHaveLength(2);
            expect(arr.fields.value[1].name.value.value).toBe("b");
        });

        it("new group has independent field state", () => {
            const arr = nixFieldArray([{ name: "a" }]);
            arr.append({ name: "b" });
            arr.fields.value[1].name.onBlur();
            expect(arr.fields.value[0].name.touched.value).toBe(false);
            expect(arr.fields.value[1].name.touched.value).toBe(true);
        });

        it("length updates reactively", () => {
            const arr = nixFieldArray<{ name: string }>([]);
            const lengths: number[] = [];
            // Track length changes via reading the signal
            arr.append({ name: "a" });
            lengths.push(arr.length.value);
            arr.append({ name: "b" });
            lengths.push(arr.length.value);
            expect(lengths).toEqual([1, 2]);
        });
    });

    describe("remove()", () => {
        it("removes the item at the given index", () => {
            const arr = nixFieldArray([{ name: "a" }, { name: "b" }, { name: "c" }]);
            arr.remove(1);
            expect(arr.fields.value).toHaveLength(2);
            expect(arr.fields.value[0].name.value.value).toBe("a");
            expect(arr.fields.value[1].name.value.value).toBe("c");
        });

        it("does nothing for out-of-range index", () => {
            const arr = nixFieldArray([{ name: "a" }]);
            expect(() => arr.remove(5)).not.toThrow();
            expect(() => arr.remove(-1)).not.toThrow();
            expect(arr.fields.value).toHaveLength(1);
        });

        it("removing the only item results in empty array", () => {
            const arr = nixFieldArray([{ name: "a" }]);
            arr.remove(0);
            expect(arr.fields.value).toHaveLength(0);
        });
    });

    describe("move()", () => {
        it("moves an item from one index to another", () => {
            const arr = nixFieldArray([{ name: "a" }, { name: "b" }, { name: "c" }]);
            arr.move(0, 2);
            expect(arr.fields.value[0].name.value.value).toBe("b");
            expect(arr.fields.value[1].name.value.value).toBe("c");
            expect(arr.fields.value[2].name.value.value).toBe("a");
        });

        it("move(i, i) is a no-op", () => {
            const arr = nixFieldArray([{ name: "a" }, { name: "b" }]);
            arr.move(0, 0);
            expect(arr.fields.value[0].name.value.value).toBe("a");
        });

        it("does nothing for out-of-range indices", () => {
            const arr = nixFieldArray([{ name: "a" }]);
            expect(() => arr.move(0, 5)).not.toThrow();
            expect(() => arr.move(-1, 0)).not.toThrow();
            expect(arr.fields.value).toHaveLength(1);
        });

        it("preserves field state after move", () => {
            const arr = nixFieldArray([{ name: "a" }, { name: "b" }]);
            arr.fields.value[0].name.onBlur(); // touch first item
            arr.move(0, 1);
            // The moved group should still have touched=true
            expect(arr.fields.value[1].name.touched.value).toBe(true);
            expect(arr.fields.value[0].name.touched.value).toBe(false);
        });
    });

    describe("replace()", () => {
        it("replaces the item at the given index with new values", () => {
            const arr = nixFieldArray([{ name: "a" }, { name: "b" }]);
            arr.replace(0, { name: "replaced" });
            expect(arr.fields.value[0].name.value.value).toBe("replaced");
            expect(arr.fields.value[1].name.value.value).toBe("b");
        });

        it("new group starts with clean state (untouched, not dirty)", () => {
            const arr = nixFieldArray([{ name: "a" }]);
            arr.fields.value[0].name.onBlur();
            arr.replace(0, { name: "fresh" });
            expect(arr.fields.value[0].name.touched.value).toBe(false);
            expect(arr.fields.value[0].name.dirty.value).toBe(false);
        });

        it("does nothing for out-of-range index", () => {
            const arr = nixFieldArray([{ name: "a" }]);
            expect(() => arr.replace(5, { name: "x" })).not.toThrow();
            expect(arr.fields.value).toHaveLength(1);
        });
    });

    describe("reset()", () => {
        it("restores the initial items", () => {
            const arr = nixFieldArray([{ name: "a" }]);
            arr.append({ name: "b" });
            arr.append({ name: "c" });
            arr.reset();
            expect(arr.fields.value).toHaveLength(1);
            expect(arr.fields.value[0].name.value.value).toBe("a");
        });

        it("new groups after reset start with clean state", () => {
            const arr = nixFieldArray([{ name: "a" }]);
            arr.fields.value[0].name.onBlur();
            arr.reset();
            expect(arr.fields.value[0].name.touched.value).toBe(false);
        });
    });

    describe("validators in nixFieldArray", () => {
        it("applies validators to each group's fields", () => {
            const arr = nixFieldArray(
                [{ name: "" }],
                { name: [required()] }
            );
            arr.fields.value[0].name.onBlur();
            expect(arr.fields.value[0].name.error.value).toBeTruthy();
        });

        it("new groups from append() also have validators", () => {
            const arr = nixFieldArray(
                [{ name: "ok" }],
                { name: [required()] }
            );
            arr.append({ name: "" });
            arr.fields.value[1].name.onBlur();
            expect(arr.fields.value[1].name.error.value).toBeTruthy();
        });
    });

    describe("validateOn in nixFieldArray", () => {
        it('validateOn "input" applies to all group fields', () => {
            const arr = nixFieldArray(
                [{ name: "" }],
                { name: [required()] },
                "input"
            );
            const event = new Event("input");
            Object.defineProperty(event, "target", { value: { value: "" } });
            arr.fields.value[0].name.onInput(event);
            expect(arr.fields.value[0].name.error.value).toBeTruthy();
        });

        it('validateOn "submit" hides errors until _forceVisible()', () => {
            const arr = nixFieldArray(
                [{ name: "" }],
                { name: [required()] },
                "submit"
            );
            arr.fields.value[0].name.onBlur();
            expect(arr.fields.value[0].name.error.value).toBeNull();
            arr.fields.value[0].name._forceVisible();
            expect(arr.fields.value[0].name.error.value).toBeTruthy();
        });
    });

    describe("_dispose()", () => {
        it("does not throw", () => {
            const arr = nixFieldArray([{ name: "a" }, { name: "b" }]);
            expect(() => arr._dispose()).not.toThrow();
        });
    });
});

describe("createForm.canSubmit", () => {
    it("is false initially when required fields are empty", () => {
        const form = createForm(
            { email: "", password: "" },
            { validators: { email: [required()], password: [required()] } }
        );
        expect(form.canSubmit.value).toBe(false);
    });

    it("becomes true only when ALL fields are valid", () => {
        const form = createForm(
            { email: "", password: "" },
            { validators: { email: [required()], password: [required()] } }
        );
        form.fields.email.value.value = "a@b.com";
        expect(form.canSubmit.value).toBe(false); // password aún vacío
        form.fields.password.value.value = "123";
        expect(form.canSubmit.value).toBe(true);
    });

    it("does not depend on touched/dirty (works with validateOn: blur)", () => {
        const form = createForm(
            { email: "" },
            { validateOn: "blur", validators: { email: [required()] } }
        );
        // Sin tocar nada, valid (visible) es true pero canSubmit es false
        expect(form.valid.value).toBe(true);
        expect(form.canSubmit.value).toBe(false);
    });

    it("reflects external errors from setErrors", () => {
        const form = createForm(
            { email: "" },
            { validators: { email: [] } }
        );
        expect(form.canSubmit.value).toBe(true);
        form.setErrors({ email: "taken" });
        expect(form.canSubmit.value).toBe(false);
        form.fields.email.value.value = "new@b.com";
        expect(form.canSubmit.value).toBe(true);
    });

    it("only notifies subscribers on boolean transitions", () => {
        const form = createForm(
            { email: "", password: "" },
            { validators: { email: [required()], password: [required()] } }
        );
        let calls = 0;
        const dispose = effect(() => {
            form.canSubmit.value;
            calls++;
        });
        calls = 0; // ignore initial run

        form.fields.email.value.value = "a"; // sigue inválido (password vacío)
        form.fields.email.value.value = "ab";
        form.fields.email.value.value = "abc";
        expect(calls).toBe(0); // no transición

        form.fields.password.value.value = "x"; // ahora sí transita a true
        expect(calls).toBe(1);

        dispose();
        form.dispose();
    });

    it("does not run options.validate (schema) reactively", () => {
        let schemaCalls = 0;
        const form = createForm(
            { email: "" },
            {
                validate: (v) => {
                    schemaCalls++;
                    return v.email ? null : { email: "required" };
                },
            }
        );
        // Leer canSubmit varias veces
        form.canSubmit.value;
        form.fields.email.value.value = "x";
        form.canSubmit.value;
        expect(schemaCalls).toBe(0); // schema solo en submit
    });

    it("clears external errors on programmatic value writes", () => {
        const form = createForm({ email: "" });
        form.setErrors({ email: "taken" });
        expect(form.canSubmit.value).toBe(false);

        // Programmatic write — no DOM event, no onInput
        form.fields.email.value.value = "fresh@example.com";
        expect(form.canSubmit.value).toBe(true);
        expect(form.fields.email.rawError.value).toBe(null);
    });

    it("clears external errors on DOM input events", () => {
        const form = createForm({ email: "" });
        form.setErrors({ email: "taken" });

        const fakeEvent = { target: { value: "fresh@example.com" } } as unknown as Event;
        form.fields.email.onInput(fakeEvent);
        expect(form.canSubmit.value).toBe(true);
    });
});

// ── nixField.setValue / _setInitialValue ──────────────────────────────────────

describe("nixField.setValue", () => {
    it("updates the field value", () => {
        const f = nixField("");
        f.setValue("hello");
        expect(f.value.value).toBe("hello");
    });

    it("marks the field dirty by default", () => {
        const f = nixField("");
        f.setValue("hello");
        expect(f.dirty.value).toBe(true);
        expect(f.touched.value).toBe(false);
    });

    it("does not mark dirty when shouldDirty is false", () => {
        const f = nixField("");
        f.setValue("hello", { shouldDirty: false });
        expect(f.dirty.value).toBe(false);
    });

    it("marks touched when shouldTouch is true", () => {
        const f = nixField("");
        f.setValue("hello", { shouldTouch: true });
        expect(f.touched.value).toBe(true);
    });

    it("forces validation visibility by default", () => {
        const f = nixField("", [required()], "submit");
        f.setValue(""); // invalid value, but shouldValidate=true marks submitted
        expect(f.error.value).toBeTruthy();
    });

    it("does not force validation when shouldValidate is false", () => {
        const f = nixField("", [required()], "submit");
        f.setValue("", { shouldValidate: false });
        expect(f.error.value).toBeNull();
    });

    it("clears external errors on value change", () => {
        const f = nixField("");
        f._setExternalError("Server error");
        expect(f.error.value).toBe("Server error");
        f.setValue("new");
        expect(f.error.value).toBeNull();
    });
});

describe("nixField._setInitialValue", () => {
    it("redirects reset() to the new initial value", () => {
        const f = nixField("initial");
        f.setValue("changed");
        f._setInitialValue("new baseline");
        f.reset();
        expect(f.value.value).toBe("new baseline");
    });

    it("does not affect the current value until reset()", () => {
        const f = nixField("initial");
        f.setValue("changed");
        f._setInitialValue("new baseline");
        expect(f.value.value).toBe("changed");
    });
});

// ── nixFieldArray.setValues / patchValues / reset ─────────────────────────────

describe("nixFieldArray.setValues", () => {
    it("replaces the whole array with new items", () => {
        const arr = nixFieldArray([{ name: "a" }, { name: "b" }]);
        arr.setValues([{ name: "x" }, { name: "y" }, { name: "z" }]);
        expect(arr.fields.value).toHaveLength(3);
        expect(arr.fields.value[0].name.value.value).toBe("x");
        expect(arr.fields.value[2].name.value.value).toBe("z");
    });

    it("disposes old groups and creates new ones", () => {
        const arr = nixFieldArray([{ name: "a" }]);
        const original = arr.fields.value[0];
        arr.setValues([{ name: "b" }]);
        expect(arr.fields.value[0]).not.toBe(original);
    });

    it("new groups start with clean state", () => {
        const arr = nixFieldArray([{ name: "a" }]);
        arr.fields.value[0].name.onBlur();
        arr.setValues([{ name: "b" }]);
        expect(arr.fields.value[0].name.touched.value).toBe(false);
        expect(arr.fields.value[0].name.dirty.value).toBe(false);
    });
});

describe("nixFieldArray.patchValues", () => {
    it("updates existing items without touching state", () => {
        const arr = nixFieldArray([{ name: "a" }, { name: "b" }]);
        arr.fields.value[0].name.onBlur();
        arr.patchValues([{ name: "x" }, { name: "y" }]);
        expect(arr.fields.value[0].name.value.value).toBe("x");
        expect(arr.fields.value[1].name.value.value).toBe("y");
        expect(arr.fields.value[0].name.touched.value).toBe(true); // preserved
        expect(arr.fields.value[0].name.dirty.value).toBe(false); // not dirtied
    });

    it("appends extra items", () => {
        const arr = nixFieldArray([{ name: "a" }]);
        arr.patchValues([{ name: "b" }, { name: "c" }]);
        expect(arr.fields.value).toHaveLength(2);
        expect(arr.fields.value[1].name.value.value).toBe("c");
    });

    it("ignores unknown keys in the patch", () => {
        const arr = nixFieldArray<{ name: string }>([{ name: "a" }]);
        arr.patchValues([{ name: "x", unknown: "y" } as Partial<{ name: string }>]);
        expect(arr.fields.value[0].name.value.value).toBe("x");
    });
});

describe("nixFieldArray.reset", () => {
    it("resets to the initial items", () => {
        const arr = nixFieldArray([{ name: "a" }]);
        arr.append({ name: "b" });
        arr.reset();
        expect(arr.fields.value).toHaveLength(1);
        expect(arr.fields.value[0].name.value.value).toBe("a");
    });

    it("resets to new items when reset(newItems) is used", () => {
        const arr = nixFieldArray([{ name: "a" }]);
        arr.reset([{ name: "x" }, { name: "y" }]);
        expect(arr.fields.value).toHaveLength(2);
        expect(arr.fields.value[0].name.value.value).toBe("x");
    });

    it("subsequent reset() uses the new baseline", () => {
        const arr = nixFieldArray([{ name: "a" }]);
        arr.reset([{ name: "x" }]);
        arr.append({ name: "y" });
        arr.reset();
        expect(arr.fields.value).toHaveLength(1);
        expect(arr.fields.value[0].name.value.value).toBe("x");
    });
});

// ── createForm.setValue / setValues / reset ───────────────────────────────────

describe("createForm.setValue", () => {
    it("sets a single top-level field", () => {
        const form = createForm({ name: "" });
        form.setValue("name", "John");
        expect(form.fields.name.value.value).toBe("John");
        expect(form.values.value).toEqual({ name: "John" });
    });

    it("sets a nested field by dot path", () => {
        const form = createForm({ address: { city: "", zip: "" } });
        form.setValue("address.city", "Lima");
        expect(form.fields["address.city"].value.value).toBe("Lima");
        expect(form.values.value.address.city).toBe("Lima");
    });

    it("ignores unknown paths", () => {
        const form = createForm({ name: "" });
        expect(() => form.setValue("unknown", "x")).not.toThrow();
        expect(form.fields.name.value.value).toBe("");
    });

    it("passes options to the field", () => {
        const form = createForm({ name: "" }, { validators: { name: [required()] }, validateOn: "submit" });
        form.setValue("name", "", { shouldValidate: false });
        expect(form.fields.name.error.value).toBeNull();
    });
});

describe("createForm.setValues", () => {
    it("sets multiple top-level fields at once", () => {
        const form = createForm({ name: "", email: "" });
        form.setValues({ name: "John", email: "john@example.com" });
        expect(form.fields.name.value.value).toBe("John");
        expect(form.fields.email.value.value).toBe("john@example.com");
    });

    it("sets nested fields at once", () => {
        const form = createForm({ address: { city: "", zip: "" } });
        form.setValues({ address: { city: "Lima" } });
        expect(form.fields["address.city"].value.value).toBe("Lima");
        expect(form.fields["address.zip"].value.value).toBe("");
    });

    it("marks fields dirty by default", () => {
        const form = createForm({ name: "" });
        form.setValues({ name: "John" });
        expect(form.fields.name.dirty.value).toBe(true);
        expect(form.fields.name.touched.value).toBe(false);
    });

    it("preserves dirty state when keepDirty is true", () => {
        const form = createForm({ name: "" });
        form.fields.name.dirty.value = true;
        form.setValues({ name: "John" }, { keepDirty: true });
        expect(form.fields.name.dirty.value).toBe(true);
    });

    it("preserves touched state when keepTouched is true", () => {
        const form = createForm({ name: "" });
        form.fields.name.onBlur();
        form.setValues({ name: "John" }, { keepTouched: true });
        expect(form.fields.name.touched.value).toBe(true);
    });

    it("does not force validation by default (keepErrors=true)", () => {
        const form = createForm({ name: "" }, { validators: { name: [required()] }, validateOn: "submit" });
        form.setValues({ name: "" });
        expect(form.fields.name.error.value).toBeNull();
    });

    it("forces validation when keepErrors is false", () => {
        const form = createForm({ name: "" }, { validators: { name: [required()] }, validateOn: "submit" });
        form.setValues({ name: "" }, { keepErrors: false });
        expect(form.fields.name.error.value).toBeTruthy();
    });

    it("clears external errors when setting values", () => {
        const form = createForm({ name: "" });
        form.setErrors({ name: "Server error" });
        form.setValues({ name: "John" });
        expect(form.fields.name.error.value).toBeNull();
    });

    it("updates the values computed signal once", () => {
        const form = createForm({ a: "", b: "" });
        let calls = 0;
        const dispose = effect(() => {
            form.values.value;
            calls++;
        });
        calls = 0;
        form.setValues({ a: "1", b: "2" });
        expect(calls).toBe(1);
        dispose();
    });
});

describe("createForm.reset", () => {
    it("resets fields to their initial values", () => {
        const form = createForm({ name: "initial" });
        form.setValues({ name: "changed" });
        form.reset();
        expect(form.fields.name.value.value).toBe("initial");
    });

    it("resets dirty, touched, and submit state", () => {
        const form = createForm({ name: "" });
        form.setValues({ name: "changed" });
        form.fields.name.onBlur();
        form.submitCount.value = 3;
        form.reset();
        expect(form.fields.name.dirty.value).toBe(false);
        expect(form.fields.name.touched.value).toBe(false);
        expect(form.submitCount.value).toBe(0);
    });

    it("uses new initial values when reset(newValues) is called", () => {
        const form = createForm({ name: "" });
        form.reset({ name: "new baseline" });
        expect(form.fields.name.value.value).toBe("new baseline");
    });

    it("subsequent reset() uses the new baseline", () => {
        const form = createForm({ name: "initial" });
        form.reset({ name: "new baseline" });
        form.setValues({ name: "changed" });
        form.reset();
        expect(form.fields.name.value.value).toBe("new baseline");
    });

    it("clears external errors", () => {
        const form = createForm({ name: "" });
        form.setErrors({ name: "Server error" });
        form.reset();
        expect(form.fields.name.error.value).toBeNull();
    });

    it("forces isSubmitting back to false", () => {
        const form = createForm({ name: "" });
        form.isSubmitting.value = true;
        form.reset();
        expect(form.isSubmitting.value).toBe(false);
    });
});