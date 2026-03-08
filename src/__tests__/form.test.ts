import { describe, it, expect, vi } from "vitest";
import {
    useField,
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

// ── useField ──────────────────────────────────────────────────────────────────

describe("useField", () => {
    it("initializes with given value", () => {
        const f = useField("hello");
        expect(f.value.value).toBe("hello");
    });

    it("starts untouched and not dirty", () => {
        const f = useField("");
        expect(f.touched.value).toBe(false);
        expect(f.dirty.value).toBe(false);
    });

    it("error is null before touched/dirty", () => {
        const f = useField("", [required()]);
        expect(f.error.value).toBeNull();
    });

    it("shows error after touched", () => {
        const f = useField("", [required()]);
        f.onBlur();
        expect(f.error.value).toBe("Required");
    });

    it("shows error after dirty via onInput", () => {
        const f = useField("hello", [minLength(10)]);
        // Simulate input event
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "hi" } });
        f.onInput(event);
        expect(f.dirty.value).toBe(true);
        expect(f.error.value).toBeTruthy();
    });

    it("reset() restores initial state", () => {
        const f = useField("abc", [required()]);
        (f.value as { value: string }).value = "changed";
        f.touched.value = true;
        f.dirty.value = true;
        f.reset();
        expect(f.value.value).toBe("abc");
        expect(f.touched.value).toBe(false);
        expect(f.dirty.value).toBe(false);
    });

    it("_setExternalError injects server-side error", () => {
        const f = useField("test");
        f._setExternalError("Email taken");
        expect(f.error.value).toBe("Email taken");
        expect(f.touched.value).toBe(true); // forced visible
    });

    it("external error clears on next input", () => {
        const f = useField("test");
        f._setExternalError("Server error");
        const event = new Event("input");
        Object.defineProperty(event, "target", { value: { value: "new" } });
        f.onInput(event);
        expect(f.error.value).toBeNull();
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
        // Before touching, no errors visible → valid
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
        // Touch both fields
        form.fields.a.onBlur();
        form.fields.b.onBlur();
        const errs = form.errors.value;
        expect(errs.a).toBeTruthy();
        expect(errs.b).toBeTruthy();
    });
});
