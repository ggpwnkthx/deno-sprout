// Check that all workspace files carry the same Hono import-map lines.
//
// Usage: deno run --allow-read scripts/check_hono_sync.ts
//
// Exits 0 if every file's Hono import lines match the canonical
// `HONO_IMPORTS` in `scripts/_hono_imports.ts`. Exits 1 with a
// descriptive message on any drift.
import { HONO_IMPORTS, HONO_VERSION } from "./_hono_imports.ts";

interface TargetFile {
  path: string;
  // Lines that should contain Hono imports, in order.
  // Each entry is the full line text (including newline).
  expectedLines: readonly string[];
}

const ROOT = new URL("../", import.meta.url).pathname;

// Build expected import lines for each file type.
// The key insight: HONO_IMPORTS values are the full jsr: URLs.
// We just need to embed them in the right JSON structure with the
// right indentation.
const honoImportLines: Record<keyof typeof HONO_IMPORTS, string> = {
  "@hono/hono": `    "@hono/hono": "jsr:@hono/hono@${HONO_VERSION}",\n`,
  "@hono/hono/jsx": `    "@hono/hono/jsx": "jsr:@hono/hono@${HONO_VERSION}/jsx",\n`,
  "@hono/hono/jsx/dom": `    "@hono/hono/jsx/dom": "jsr:@hono/hono@${HONO_VERSION}/jsx/dom",\n`,
  "@hono/hono/jsx/dom/jsx-runtime":
    `    "@hono/hono/jsx/dom/jsx-runtime": "jsr:@hono/hono@${HONO_VERSION}/jsx/dom/jsx-runtime",\n`,
  "@hono/hono/html": `    "@hono/hono/html": "jsr:@hono/hono@${HONO_VERSION}/html"\n`,
};

const TARGETS: TargetFile[] = [
  {
    path: ROOT + "deno.jsonc",
    expectedLines: [
      honoImportLines["@hono/hono"],
      honoImportLines["@hono/hono/jsx"],
      honoImportLines["@hono/hono/jsx/dom"],
      honoImportLines["@hono/hono/jsx/dom/jsx-runtime"],
      honoImportLines["@hono/hono/html"],
    ],
  },
  {
    path: ROOT + "packages/core/deno.jsonc",
    expectedLines: [
      honoImportLines["@hono/hono"],
      honoImportLines["@hono/hono/jsx"],
      honoImportLines["@hono/hono/html"],
    ],
  },
  {
    path: ROOT + "packages/jsx/deno.jsonc",
    expectedLines: [
      honoImportLines["@hono/hono"],
      honoImportLines["@hono/hono/jsx"],
      honoImportLines["@hono/hono/jsx/dom"],
      honoImportLines["@hono/hono/jsx/dom/jsx-runtime"],
      honoImportLines["@hono/hono/html"],
    ],
  },
  {
    path: ROOT + "packages/cli/templates.ts",
    expectedLines: [
      honoImportLines["@hono/hono"],
      honoImportLines["@hono/hono/jsx"],
      honoImportLines["@hono/hono/jsx/dom"],
      honoImportLines["@hono/hono/jsx/dom/jsx-runtime"],
      // Last entry still has trailing comma in JSON inside a template literal
      `    "@hono/hono/html": "jsr:@hono/hono@${HONO_VERSION}/html",\n`,
    ],
  },
  {
    path: ROOT + "tests/examples/deno.json",
    expectedLines: [
      `    "@hono/hono": "jsr:@hono/hono@${HONO_VERSION}",\n`,
    ],
  },
  {
    path: ROOT + "scripts/smoke.ts",
    expectedLines: [
      honoImportLines["@hono/hono"].replace("    ", "      "),
      honoImportLines["@hono/hono/jsx"].replace("    ", "      "),
      honoImportLines["@hono/hono/jsx/dom"].replace("    ", "      "),
      honoImportLines["@hono/hono/jsx/dom/jsx-runtime"].replace("    ", "      "),
      // Last entry still has trailing comma in JSON inside the smoke script
      `      "@hono/hono/html": "jsr:@hono/hono@${HONO_VERSION}/html",\n`,
    ],
  },
];

function checkFile(target: TargetFile): string[] {
  const errors: string[] = [];
  const content = Deno.readTextFileSync(target.path);
  const lines = content.split("\n");

  for (const expected of target.expectedLines) {
    // Strip trailing whitespace for comparison (deno.jsonc may have
    // slightly different formatting at line endings).
    const expectedStripped = expected.trimEnd();
    const found = lines.some((l) => l.trimEnd() === expectedStripped);
    if (!found) {
      errors.push(
        `  Expected: ${JSON.stringify(expectedStripped)}`,
        `  Not found in ${target.path}`,
      );
    }
  }
  return errors;
}

let hasErrors = false;
for (const target of TARGETS) {
  const errors = checkFile(target);
  if (errors.length > 0) {
    hasErrors = true;
    console.error(`FAIL: ${target.path}`);
    for (const e of errors) {
      console.error(e);
    }
  }
}

if (hasErrors) {
  console.error("\nHono import drift detected. Run `deno task check-hono-sync` for details.");
  Deno.exit(1);
} else {
  console.log("All Hono import lines are in sync.");
  Deno.exit(0);
}
