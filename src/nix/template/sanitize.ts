// =============================================================================
// --- Attribute value sanitization ---
// =============================================================================
//
// Threat model: in Nix the attribute *name* is always authored by the developer
// (it lives in the static part of the html`` literal and is never interpolated),
// so it is trusted. The attribute *value* is frequently untrusted (API data,
// user input, route params). The only attribute family where an untrusted value
// is interpreted as executable code is URL attributes via the `javascript:`,
// `vbscript:` and `data:text/html` schemes.
//
// Performance: the *classification* (`isUrlAttrName`) runs once per template at
// compile time (cached in the BindingContext). The actual `sanitizeUrl` runs
// only for URL attributes and only when their value changes — never for
// `class`, `style`, `aria-*`, `data-*` or any other attribute.

/**
 * Attributes whose value the browser resolves as a URL. Only these go through
 * `sanitizeUrl`. Everything else (class, style, aria-*, data-*, custom) is
 * untouched and keeps its exact original code path.
 */
const URL_ATTRS = new Set([
    "href",
    "src",
    "action",
    "formaction",
    "xlink:href",
    "poster",
    "background",
    "cite",
    "ping",
    "data", // <object data="...">
]);

/** True if `name` is a URL-bearing attribute that must be scheme-checked. */
export function isUrlAttrName(name: string): boolean {
    return URL_ATTRS.has(name.toLowerCase());
}

/**
 * True if `name` is an attribute that turns its value into executable code or
 * arbitrary markup (inline event handlers, `srcdoc`). In idiomatic Nix events
 * use `@click` (handled as an event binding, never as an attribute), so an
 * `on*`/`srcdoc` attribute binding is almost always a developer mistake. Used
 * only to emit a warning — never to block.
 */
export function isExecutableAttrName(name: string): boolean {
    const n = name.toLowerCase();
    return n.startsWith("on") || n === "srcdoc";
}

// Characters the browser strips/ignores while resolving a scheme. Removing them
// before testing the scheme prevents bypasses like "java\tscript:" or leading
// control bytes / BOM / line separators.
const CONTROL_RE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFEFF]/g;

// Dangerous URL schemes. `data:` is included because `data:text/html` and
// `data:image/svg+xml` can execute script; safe raster data URIs are allowed
// back in below.
const UNSAFE_SCHEME_RE = /^(?:javascript|vbscript|livescript|mocha|data):/i;

// Raster image data URIs are safe (cannot execute script). SVG is intentionally
// excluded because it can carry inline scripts.
const SAFE_DATA_RE = /^data:image\/(?:png|jpe?g|gif|webp|avif|bmp|x-icon|vnd\.microsoft\.icon)[;,]/i;

/**
 * Returns the URL unchanged if its scheme is safe; otherwise returns "" and
 * warns. Normalizes control characters and surrounding whitespace before the
 * scheme check so that obfuscated payloads cannot slip through.
 */
export function sanitizeUrl(raw: string): string {
    const normalized = raw.replace(CONTROL_RE, "").trim();

    if (UNSAFE_SCHEME_RE.test(normalized)) {
        if (/^data:/i.test(normalized) && SAFE_DATA_RE.test(normalized)) {
            return raw;
        }
        console.warn(
            `[Nix] Blocked attribute URL with unsafe scheme: "${normalized.slice(0, 48)}${normalized.length > 48 ? "…" : ""}"`,
        );
        return "";
    }

    return raw;
}
