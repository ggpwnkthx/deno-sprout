// Tests for the import-detection logic inside walkUserInputs.
//
// Covers the patterns that extractImportSpecifiers handles:
//   - side-effect imports: import "specifier"
//   - default/named/namespace imports: import x from "specifier"
//   - dynamic imports: import("specifier")
//   - multi-line imports
//   - skipping line comments: // from "commented-out.ts"
//   - skipping block comments: /* from "block-comment.ts" */
import { assertEquals } from "jsr:@std/assert@1";

// We test the internal helper directly rather than through walkUserInputs
// so the test is stable regardless of filesystem state. The function is
// package-internal; the test lives in the same package and can import it.
const { extractImportSpecifiers } = await import("./build/dev_assets.ts");

Deno.test("extractImportSpecifiers: detects side-effect import", () => {
  const specifiers = extractImportSpecifiers(
    `import "./style.css";\nimport { a } from "./b.ts";\n`,
  );
  assertEquals(specifiers, ["./style.css", "./b.ts"]);
});

Deno.test("extractImportSpecifiers: detects import with default specifier", () => {
  const specifiers = extractImportSpecifiers(
    `import React from "react";\n`,
  );
  // bare specifiers are returned by extractImportSpecifiers;
  // walkUserInputs filters them to relative-only.
  assertEquals(specifiers, ["react"]);
});

Deno.test("extractImportSpecifiers: detects named import", () => {
  const specifiers = extractImportSpecifiers(
    `import { useState, useEffect } from "./hooks.ts";\n`,
  );
  assertEquals(specifiers, ["./hooks.ts"]);
});

Deno.test("extractImportSpecifiers: detects namespace import", () => {
  const specifiers = extractImportSpecifiers(
    `import * as utils from "./utils.ts";\n`,
  );
  assertEquals(specifiers, ["./utils.ts"]);
});

Deno.test("extractImportSpecifiers: detects dynamic import", () => {
  const specifiers = extractImportSpecifiers(
    `const m = await import("./dynamic.ts");\n`,
  );
  assertEquals(specifiers, ["./dynamic.ts"]);
});

Deno.test("extractImportSpecifiers: skips line-comment specifier", () => {
  const specifiers = extractImportSpecifiers(
    `// import "./commented-out.ts"\nimport { a } from "./real.ts";\n`,
  );
  assertEquals(specifiers, ["./real.ts"]);
});

Deno.test("extractImportSpecifiers: skips block-comment specifier", () => {
  const specifiers = extractImportSpecifiers(
    `/* import "./block-comment.ts" */\nimport { a } from "./real.ts";\n`,
  );
  assertEquals(specifiers, ["./real.ts"]);
});

Deno.test("extractImportSpecifiers: detects multi-line named import", () => {
  const specifiers = extractImportSpecifiers(
    `import {
  useState,
  useEffect,
  type UseState,
} from "./hooks.ts";\n`,
  );
  assertEquals(specifiers, ["./hooks.ts"]);
});

Deno.test("extractImportSpecifiers: skips non-string-literal dynamic import", () => {
  // import(variable) — the specifier is not a string literal, so we skip it
  const specifiers = extractImportSpecifiers(
    `const m = await import(variable);\n`,
  );
  assertEquals(specifiers, []);
});

Deno.test("extractImportSpecifiers: bare specifiers without from are found", () => {
  // import "npm:thing" (bare, no 'from') IS detected because side-effect
  // imports (import "specifier") are detected separately from the 'from' path.
  const specifiers = extractImportSpecifiers(
    `import { a } from "@sprout/runtime";\nimport "npm:thing";\n`,
  );
  // Both are found: "@sprout/runtime" from the named import, "npm:thing" from the side-effect import.
  assertEquals(specifiers, ["@sprout/runtime", "npm:thing"]);
});

Deno.test("extractImportSpecifiers: handles mixed real and commented imports", () => {
  const specifiers = extractImportSpecifiers(
    `// import "./skipped.ts"\nimport { a } from "./real-a.ts";\n/* import "./also-skipped.ts" */\nimport * as b from "./real-b.ts";\nimport c from "./real-c.ts";\n`,
  );
  assertEquals(specifiers, ["./real-a.ts", "./real-b.ts", "./real-c.ts"]);
});
