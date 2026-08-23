// =============================================================================
// --- Partial attribute interpolation normalization ---
// =============================================================================
//
// Nix templates only allow *full* attribute bindings: `class=${value}`.
// Partial interpolation (`class="btn ${size}"`) is a template-literal feature
// that this module normalizes into a single canonical binding *before* the
// existing pipeline (detectContext / buildHTML / activate / SSR / hydration)
// sees the template.
//
// For a partial like:
//
//   html`<a class="btn ${cls} size-${n}" href="/x/${id}">`
//
// the analysis produces a canonical template equivalent to:
//
//   html`<a class=${compose("btn ", cls, " size-", n, "")}
//           href=${compose("/x/", id, "")}>`
//
// The normalization is a pure, DOM-free lexer over the cooked strings of the
// `html`` literal; the resulting plan is cached per TemplateStringsArray
// identity. Templates without partials keep their exact current behavior.
//
// Semantics (confirmed):
//   - Partial segments follow JS interpolation: null/undefined/false render
//     as "null"/"undefined"/"false".
//   - Every dynamic segment is coerced with String() individually, so
//     `${a}${b}` renders "12" (never `1 + 2 === 3`), exactly like a template
//     literal.
//   - A full interpolation without static segments keeps its original value
//     (preserving the current null/false attribute removal and DOM-property
//     semantics).
//   - Composite bindings on @event, ref, show, hide and HTML boolean
//     attributes are rejected with a descriptive error.
//   - Dynamic tag names, dynamic attribute names and spreads are rejected
//     (they produce corrupt markup today).

export interface CompositeAttributePlan {
    readonly type: "composite-attribute";
    /** First original interpolation index of the attribute value. */
    readonly firstHole: number;
    /** Last original interpolation index of the attribute value. */
    readonly lastHole: number;
    /** Static attribute name (author authored, never interpolated). */
    readonly attrName: string;
    /** Position of the attribute name start within `strings[firstHole]`. */
    readonly attrStart: number;
    /** Opening quote of the value, or null for unquoted values. */
    readonly quote: '"' | "'" | null;
    /** Static segments around/between the interpolations (holes + 1 entries). */
    readonly literals: readonly string[];
    /** Original value indices, in evaluation order. */
    readonly sourceIndices: readonly number[];
}

export type ValuePlan =
    | { readonly type: "passthrough" }
    | CompositeAttributePlan;

export interface TemplateNormalizationPlan {
    readonly hasPartialAttributes: boolean;
    /**
     * Canonical strings. For templates without partials this is the exact
     * original `strings` reference (fast path, zero allocation).
     */
    readonly normalizedStrings: readonly string[];
    /** One plan per original interpolation, in source order. */
    readonly valuePlans: readonly ValuePlan[];
}

// =============================================================================
// --- Reserved attribute semantics ---
// =============================================================================

// HTML boolean attributes depend on *presence*, not on their string value, so
// a partial interpolation ("checked=\"x${v}\"") is a semantic contradiction.
const BOOLEAN_ATTRS = new Set([
    "allowfullscreen", "async", "autofocus", "autoplay", "checked",
    "controls", "default", "defer", "disabled", "formnovalidate",
    "hidden", "inert", "ismap", "itemscope", "loop", "multiple",
    "muted", "nomodule", "novalidate", "open", "playsinline",
    "readonly", "required", "reversed", "selected",
]);

// Directives receive objects/handlers/conditions, not concatenable text.
const DIRECTIVE_ATTRS = new Set(["ref", "show", "hide"]);

function validateCompositeAttr(attrName: string, index: number): void {
    if (attrName.startsWith("@")) {
        throw new Error(
            `[nix-js] Partial attribute interpolation is not supported on event bindings: "${attrName}" (binding index ${index}). ` +
                `Event handlers must be a single full interpolation: ${attrName}=${"${handler}"}`,
        );
    }
    if (DIRECTIVE_ATTRS.has(attrName.toLowerCase())) {
        throw new Error(
            `[nix-js] Partial attribute interpolation is not supported on directive "${attrName}" (binding index ${index}). ` +
                `Directives must be a single full interpolation: ${attrName}=${"${value}"}`,
        );
    }
    if (BOOLEAN_ATTRS.has(attrName.toLowerCase())) {
        throw new Error(
            `[nix-js] Partial attribute interpolation is not supported on boolean attribute "${attrName}" (binding index ${index}). ` +
                `Boolean attributes depend on presence, not on their value: ${attrName}=${"${condition}"}`,
        );
    }
}

// =============================================================================
// --- Lexer ---
// =============================================================================

type LexState =
    | "text"
    | "tag-open"
    | "tag-name"
    | "tag-body"
    | "attr-name"
    | "attr-ws"
    | "after-eq"
    | "value-dq"
    | "value-sq"
    | "value-unq"
    | "comment"
    | "doctype"
    | "pi"
    | "raw-text";

const RAW_TEXT_TAGS = new Set(["script", "style", "textarea"]);

function isSpace(c: string): boolean {
    return c === " " || c === "\t" || c === "\n" || c === "\r" || c === "\f";
}

function isNameStart(c: string): boolean {
    return (c >= "a" && c <= "z") || (c >= "A" && c <= "Z");
}

interface ValueRegion {
    attrName: string;
    /** Position of the attribute-name start inside its source string. */
    attrStart: number;
    quote: '"' | "'" | null;
    /** Original interpolation indices inside this value, in order. */
    holes: number[];
    /** Static segments: one per hole plus the trailing segment. */
    literals: string[];
    /** Accumulator for the static text of the current segment. */
    literal: string;
}

interface LexResult {
    groups: CompositeAttributePlan[];
    valuePlans: ValuePlan[];
}

/**
 * Pure state machine over the cooked template strings. Records, for every
 * interpolation, whether it lives inside an attribute value and groups
 * consecutive interpolations that belong to the same value.
 */
function lexTemplate(strings: readonly string[]): LexResult {
    const holeCount = strings.length - 1;
    const valuePlans: ValuePlan[] = new Array<ValuePlan>(holeCount);

    let state: LexState = "text";
    let rawTag: string | null = null;
    let tagIsClosing = false;
    let tagName = "";
    let attrName = "";
    let attrStart = -1;
    let region: ValueRegion | null = null;

    const groups: CompositeAttributePlan[] = [];

    const closeRegion = (atEnd = false): void => {
        const r = region;
        region = null;
        if (!r) return;
        if (atEnd && r.quote !== null && r.holes.length > 0) {
            throw new Error(
                `[nix-js] Unclosed quoted attribute value for "${r.attrName}" (binding index ${r.holes[0]}). ` +
                    `Add the closing ${r.quote}: ${r.attrName}=${r.quote}...${r.quote}`,
            );
        }
        r.literals.push(r.literal);
        r.literal = "";
        if (r.holes.length === 0) return; // purely static value — nothing to do
        const hasStatic = r.literals.some((l) => l.length > 0);
        if (r.holes.length === 1 && !hasStatic) {
            // Full binding: `class=${x}` / `class="${x}"` — untouched.
            valuePlans[r.holes[0]] = { type: "passthrough" };
            return;
        }
        validateCompositeAttr(r.attrName, r.holes[0]);
        const group: CompositeAttributePlan = {
            type: "composite-attribute",
            firstHole: r.holes[0],
            lastHole: r.holes[r.holes.length - 1],
            attrName: r.attrName,
            attrStart: r.attrStart,
            quote: r.quote,
            literals: r.literals,
            sourceIndices: r.holes,
        };
        for (const h of r.holes) valuePlans[h] = group;
        groups.push(group);
    };

    const recordHole = (hole: number): void => {
        switch (state) {
            case "value-dq":
            case "value-sq":
            case "value-unq":
                if (!region) {
                    valuePlans[hole] = { type: "passthrough" };
                    break;
                }
                region.literals.push(region.literal);
                region.literal = "";
                region.holes.push(hole);
                break;
            case "after-eq": {
                // The value begins with this interpolation and no static
                // content precedes it: open an unquoted value region.
                region = {
                    attrName,
                    attrStart,
                    quote: null,
                    holes: [hole],
                    literals: [""],
                    literal: "",
                };
                state = "value-unq";
                break;
            }
            case "tag-open":
            case "tag-name":
                throw new Error(
                    `[nix-js] Interpolation inside a tag name (binding index ${hole}) is not supported. ` +
                        "Dynamic tag names are not part of Nix templates.",
                );
            case "tag-body":
            case "attr-name":
            case "attr-ws":
                throw new Error(
                    `[nix-js] Interpolation inside an attribute name or in the tag body (binding index ${hole}) is not supported. ` +
                        "Attribute names must be static: class=${value}",
                );
            default:
                // text, comment, doctype, pi, raw-text → node binding.
                valuePlans[hole] = { type: "passthrough" };
        }
    };

    const maybeEnterRawText = (): LexState => {
        if (!tagIsClosing && RAW_TEXT_TAGS.has(tagName.toLowerCase())) {
            rawTag = tagName.toLowerCase();
            return "raw-text";
        }
        return "text";
    };

    for (let si = 0; si < strings.length; si++) {
        const s = strings[si];
        const n = s.length;
        let j = 0;

        while (j < n) {
            const c = s[j];
            // Snapshot the state so that in-switch assignments to `state` do
            // not narrow the switch scrutinee across case clauses.
            const st: LexState = state;

            switch (st) {
                case "text":
                    if (c === "<") state = "tag-open";
                    j++;
                    break;

                case "tag-open":
                    if (c === "/") {
                        tagIsClosing = true;
                        tagName = "";
                        state = "tag-name";
                    } else if (c === "!") {
                        if (s[j + 1] === "-" && s[j + 2] === "-") {
                            state = "comment";
                            j += 3;
                            break;
                        }
                        state = "doctype";
                    } else if (c === "?") {
                        state = "pi";
                    } else if (isNameStart(c)) {
                        tagIsClosing = false;
                        tagName = "";
                        state = "tag-name";
                    } else {
                        // Not a valid tag open — resume as text.
                        state = "text";
                    }
                    j++;
                    break;

                case "tag-name":
                    if (c === ">") {
                        state = maybeEnterRawText();
                        j++;
                        break;
                    }
                    if (isSpace(c) || c === "/") {
                        state = "tag-body";
                        j++;
                        break;
                    }
                    tagName += c;
                    j++;
                    break;

                case "tag-body":
                    if (c === ">") {
                        state = maybeEnterRawText();
                    } else if (isSpace(c) || c === "/") {
                        // whitespace or stray slash — stay in tag body
                    } else if (c === "<") {
                        state = "tag-open";
                    } else {
                        attrStart = j;
                        attrName = "";
                        state = "attr-name";
                        break;
                    }
                    j++;
                    break;

                case "attr-name":
                    if (c === "=") {
                        attrName = s.slice(attrStart, j);
                        state = "after-eq";
                    } else if (isSpace(c)) {
                        attrName = s.slice(attrStart, j);
                        state = "attr-ws";
                    } else if (c === ">") {
                        state = maybeEnterRawText();
                    } else {
                        // `/` and any other char are part of the name — the
                        // HTML tokenizer is lenient here and so are we.
                    }
                    j++;
                    break;

                case "attr-ws":
                    if (c === "=") {
                        state = "after-eq";
                    } else if (isSpace(c)) {
                        // keep waiting for `=`
                    } else if (c === ">") {
                        state = maybeEnterRawText();
                    } else {
                        // boolean attribute followed by a new attribute name
                        attrStart = j;
                        attrName = "";
                        state = "attr-name";
                        break;
                    }
                    j++;
                    break;

                case "after-eq":
                    if (c === '"' || c === "'") {
                        region = {
                            attrName,
                            attrStart,
                            quote: c,
                            holes: [],
                            literals: [],
                            literal: "",
                        };
                        state = c === '"' ? "value-dq" : "value-sq";
                    } else if (isSpace(c)) {
                        // whitespace before the value is allowed by the
                        // HTML5 tokenizer — keep waiting
                    } else if (c === ">") {
                        state = maybeEnterRawText();
                    } else {
                        region = {
                            attrName,
                            attrStart,
                            quote: null,
                            holes: [],
                            literals: [],
                            literal: c,
                        };
                        state = "value-unq";
                    }
                    j++;
                    break;

                case "value-dq":
                    if (c === '"') {
                        closeRegion();
                        state = "tag-body";
                    } else {
                        region!.literal += c;
                    }
                    j++;
                    break;

                case "value-sq":
                    if (c === "'") {
                        closeRegion();
                        state = "tag-body";
                    } else {
                        region!.literal += c;
                    }
                    j++;
                    break;

                case "value-unq":
                    if (isSpace(c)) {
                        closeRegion();
                        state = "tag-body";
                    } else if (c === ">") {
                        closeRegion();
                        state = maybeEnterRawText();
                    } else {
                        region!.literal += c;
                    }
                    j++;
                    break;

                case "comment":
                    if (c === "-" && s[j + 1] === "-" && s[j + 2] === ">") {
                        state = "text";
                        j += 3;
                        break;
                    }
                    j++;
                    break;

                case "doctype":
                case "pi":
                    if (c === ">") state = "text";
                    j++;
                    break;

                case "raw-text": {
                    const raw = rawTag!;
                    if (c === "<" && s[j + 1] === "/") {
                        // Try to match the closing tag `</rawTag`.
                        let m = 2;
                        let ok = true;
                        for (let k = 0; k < raw.length; k++) {
                            const ch = s[j + m];
                            if (ch === undefined || ch.toLowerCase() !== raw[k]) {
                                ok = false;
                                break;
                            }
                            m++;
                        }
                        if (ok) {
                            while (s[j + m] !== undefined && isSpace(s[j + m])) m++;
                            if (s[j + m] === ">") {
                                state = "text";
                                rawTag = null;
                                j += m + 1;
                                break;
                            }
                        }
                    }
                    j++;
                    break;
                }
            }
        }

        if (si < holeCount) {
            recordHole(si);
        }
    }

    // Template ends inside a value (unterminated quote or unquoted tail).
    closeRegion(true);

    return { groups, valuePlans };
}

// =============================================================================
// --- Plan construction ---
// =============================================================================

/**
 * Analyzes the cooked strings of an `html`` literal and produces the cached
 * normalization plan. Throws descriptive errors for ambiguous constructs.
 */
export function analyzeTemplate(strings: readonly string[]): TemplateNormalizationPlan {
    const { groups, valuePlans } = lexTemplate(strings);

    if (groups.length === 0) {
        return {
            hasPartialAttributes: false,
            normalizedStrings: strings,
            valuePlans,
        };
    }

    const n = strings.length - 1;
    const leadTrim = new Uint32Array(n + 1);
    const tailTrim = new Uint32Array(n + 1);
    const consumed = new Set<number>();
    /** For strings that start a composite group: canonical attr head info. */
    const headInfo = new Array<CompositeAttributePlan | null>(n + 1).fill(null);

    for (const g of groups) {
        headInfo[g.firstHole] = g;
        tailTrim[g.firstHole] = g.literals[0].length;
        leadTrim[g.lastHole + 1] = g.literals[g.literals.length - 1].length;
        for (let k = g.firstHole + 1; k <= g.lastHole; k++) consumed.add(k);
    }

    const normalized: string[] = [];
    for (let i = 0; i <= n; i++) {
        if (consumed.has(i)) continue;
        let s = strings[i];
        const lt = leadTrim[i];
        if (lt) s = s.slice(lt);
        const head = headInfo[i];
        if (head) {
            // Rebuild the canonical head `name=...` (or `name="...`), dropping
            // any whitespace around the `=` so detectContext and the marker
            // cut logic see exactly one canonical form. The value content
            // after the `=` (the leading literal) lives in the composition.
            s = s.slice(0, head.attrStart - lt) + head.attrName + "=" + (head.quote ?? "");
        } else {
            const tt = tailTrim[i];
            if (tt) s = s.slice(0, s.length - tt);
        }
        normalized.push(s);
    }

    return {
        hasPartialAttributes: true,
        normalizedStrings: normalized,
        valuePlans,
    };
}

// =============================================================================
// --- Composition ---
// =============================================================================

/**
 * Builds the canonical values for one `html()` invocation from a cached plan.
 * Returns the original `values` reference for templates without partials.
 */
export function buildCanonicalValues(
    plan: TemplateNormalizationPlan,
    values: readonly unknown[],
): readonly unknown[] {
    if (!plan.hasPartialAttributes) return values;

    const out: unknown[] = [];
    const plans = plan.valuePlans;
    for (let h = 0; h < plans.length; h++) {
        const p = plans[h];
        if (p.type === "passthrough") {
            out.push(values[h]);
        } else if (h === p.firstHole) {
            out.push(composeAttribute(p, values));
        }
    }
    return out;
}

/**
 * Composes the value of a partial attribute.
 *
 * - If no segment is a function, the string is composed once at `html()` time
 *   (no effect, no closure).
 * - If at least one segment is a function, a single reactive getter is
 *   returned. The getter invokes only the function segments (left to right,
 *   inside the same `effect`) and coerces every segment with `String()`.
 */
function composeAttribute(
    group: CompositeAttributePlan,
    values: readonly unknown[],
): unknown {
    const { literals, sourceIndices } = group;

    let hasFn = false;
    for (const idx of sourceIndices) {
        if (typeof values[idx] === "function") {
            hasFn = true;
            break;
        }
    }

    if (!hasFn) {
        let out = literals[0];
        for (let i = 0; i < sourceIndices.length; i++) {
            out += String(values[sourceIndices[i]]);
            out += literals[i + 1];
        }
        return out;
    }

    return () => {
        let out = literals[0];
        for (let i = 0; i < sourceIndices.length; i++) {
            const v = values[sourceIndices[i]];
            out += String(typeof v === "function" ? v() : v);
            out += literals[i + 1];
        }
        return out;
    };
}