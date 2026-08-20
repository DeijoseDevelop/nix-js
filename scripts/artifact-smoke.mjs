// Artifact smoke test — validates the MINIFIED published bundle (`dist/lib/*`).
// This guards the SSR array/hydration/keyed regressions that historically
// appeared only in minified output (esbuild name mangling with shared chunks).
//
// Run after `npm run build:lib`:
//   npm run test:artifact
import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const libDir = resolve(here, "../dist/lib");

const missing = ["nix-js.js", "server.js", "hydrate.js"].filter(
    (name) => !readdirSync(libDir).includes(name),
);
if (missing.length > 0) {
    console.error(`[nix-js] Artifact smoke failed: missing minified entries ${missing.join(", ")}. Run "npm run build:lib" first.`);
    process.exit(1);
}

const { html, repeat } = await import(`${libDir}/nix-js.js`);
const { renderToString, renderToChunks } = await import(`${libDir}/server.js`);
const { hydrate } = await import(`${libDir}/hydrate.js`);

const failures = [];
const check = (label, condition, detail = "") => {
    if (!condition) failures.push(`${label} ${detail}`);
    else console.log(`  ok  ${label}`);
};

// 1. SSR array of templates (the original minification bug)
const nested = html`<span>${"nested"}</span>`;
const arrayTemplate = html`<div>${[nested, "text", null, false, 3]}</div>`;
const arrayOut = await renderToString(arrayTemplate, { markers: "hydration" });
check("SSR arrays render without [object Object]", !arrayOut.includes("[object Object]"), `-> ${arrayOut}`);
check("SSR arrays render text content", arrayOut.includes("nested") && arrayOut.includes("text") && arrayOut.includes("3<!--nix-aiend-->"), `-> ${arrayOut}`);

// 2. SSR keyed list with hydration markers
const keyed = repeat([{ id: "a", n: 1 }, { id: "b", n: 2 }], (item) => item.id, (item) => html`<li>${item.n}</li>`);
const keyedTemplate = html`<ul>${() => keyed}</ul>`;
const keyedOut = await renderToString(keyedTemplate, { markers: "hydration" });
check("SSR keyed emits markers", keyedOut.includes("<!--nix-ki:") && keyedOut.includes("<!--nix-ke-->"), `-> ${keyedOut}`);
check("SSR keyed renders items", keyedOut.includes("<li>") && !keyedOut.includes("[object Object]"));

// 3. Hydration round-trip on the minified bundle
if (typeof document !== "undefined") {
    const container = document.createElement("div");
    container.innerHTML = keyedOut;
    const handle = hydrate(keyedTemplate, container);
    check("hydrate adopts keyed DOM", container.querySelectorAll("li").length === 2);
    handle.unmount();
}

// 4. renderToChunks parity with renderToString
let chunked = "";
for await (const chunk of renderToChunks(arrayTemplate, { markers: "hydration" })) {
    if (chunk.type === "markup" || chunk.type === "boundary-start" || chunk.type === "boundary-end") {
        chunked += chunk.value;
    }
}
check("renderToChunks parity", chunked === arrayOut);

// 5. CJS artifact smoke
import { createRequire } from "node:module";
try {
    const require = createRequire(import.meta.url);
    const cjs = require(`${libDir}/server.cjs`);
    const cjsMain = require(`${libDir}/nix-js.cjs`);
    const cjsTemplate = cjsMain.html`<div>${["a", "b"]}</div>`;
    const cjsOut = await cjs.renderToString(cjsTemplate, { markers: "hydration" });
    check("CJS SSR renders", cjsOut.includes("a") && cjsOut.includes("b") && !cjsOut.includes("[object Object]"));
} catch (error) {
    check("CJS artifact load", false, `-> ${error.message}`);
}

if (failures.length > 0) {
    console.error(`\n[nix-js] Artifact smoke FAILED (${failures.length}):`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
}
console.log("\n[nix-js] Minified artifact smoke passed.");
