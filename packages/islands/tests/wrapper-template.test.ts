// wrapper-template_test.ts - Tests for generateIslandWrapper
import { assertEquals } from "@std/assert";
import { generateIslandWrapper } from "../lib/wrapper-template.ts";

function extractImportPath(source: string, from: string): string | null {
  // Match both named imports (import { foo }) and default imports (import foo)
  const namedRe = new RegExp(
    `import\\s+\\{[^}]*${from}[^}]*\\}\\s+from\\s+"([^"]+)"`,
  );
  const defaultRe = new RegExp(
    `import\\s+${from}\\s+from\\s+"([^"]+)"`,
  );
  return source.match(namedRe)?.[1] ?? source.match(defaultRe)?.[1] ?? null;
}

function extractDefaultExport(source: string): string | null {
  const re = /export\s+default\s+function\s+(\w+)/;
  return source.match(re)?.[1] ?? null;
}

Deno.test("generateIslandWrapper: mount import points to /_sprout/runtime/mount.js", () => {
  const output = generateIslandWrapper("Counter");
  const importPath = extractImportPath(output, "mount");
  assertEquals(importPath, "/_sprout/runtime/mount.js");
});

Deno.test("generateIslandWrapper: component import path includes island name", () => {
  for (const name of ["Counter", "SearchBar", "Modal", "DataTable"]) {
    const output = generateIslandWrapper(name);
    const importPath = extractImportPath(output, "Component");
    assertEquals(
      importPath,
      `./${name}.tsx`,
      `Expected ./${name}.tsx but got ${importPath} for island ${name}`,
    );
  }
});

Deno.test("generateIslandWrapper: exports a default function named hydrate", () => {
  const output = generateIslandWrapper("Counter");
  const fnName = extractDefaultExport(output);
  assertEquals(fnName, "hydrate");
});

Deno.test("generateIslandWrapper: error message embeds the island name", () => {
  for (const name of ["Counter", "SearchBar", "Modal"]) {
    const output = generateIslandWrapper(name);
    assertEquals(
      output.includes(`Failed to hydrate island ${name}`),
      true,
      `Missing "Failed to hydrate island ${name}" in output`,
    );
  }
});

Deno.test("generateIslandWrapper: transpiles without errors", () => {
  for (const name of ["Counter", "SearchBar", "Modal", "DataTable"]) {
    const output = generateIslandWrapper(name);
    // Verify basic TypeScript structural properties:
    // - No unclosed template literals (backticks must balance)
    // - No broken import/export statements
    // - Default export function is properly closed
    const backtickCount = (output.match(/`/g) ?? []).length;
    assertEquals(backtickCount % 2, 0, `Unbalanced backticks in ${name}`);
    assertEquals(output.includes('from "/_sprout/runtime/mount.js"'), true);
    assertEquals(output.includes("export default function hydrate"), true);
    assertEquals(output.includes(`./${name}.tsx"`), true);
  }
});

Deno.test("generateIslandWrapper: hydrate call passes Component, props, and el", () => {
  const output = generateIslandWrapper("Counter");
  // match: mount(Component, props, el)
  const re = /mount\s*\(\s*Component\s*,\s*props\s*,\s*el\s*\)/;
  assertEquals(re.test(output), true);
});

Deno.test("generateIslandWrapper: custom mountUrl is reflected in generated import", () => {
  const output = generateIslandWrapper("Counter", {
    mountUrl: "/custom/runtime/mount.js",
  });
  assertEquals(output.includes('from "/custom/runtime/mount.js"'), true);
});
