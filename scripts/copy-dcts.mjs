// Copies every .d.ts to .d.cts so that CJS consumers get correct types
// via the "require" condition in package.json exports.
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = "dist/lib";

function walk(d) {
  for (const entry of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, entry.name);
    if (entry.isDirectory()) {
      walk(p);
    } else if (entry.name.endsWith(".d.ts")) {
      const cts = p.slice(0, -5) + ".d.cts";
      if (!existsSync(cts)) writeFileSync(cts, readFileSync(p, "utf8"));
    }
  }
}

walk(dir);
