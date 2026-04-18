// wrapper-template_test.ts - Tests for generateIslandWrapper
import { assertEquals } from "@std/assert";
import { generateIslandWrapper } from "./wrapper-template.ts";

Deno.test("generateIslandWrapper: contains component import path", () => {
  const output = generateIslandWrapper("Counter");
  assertEquals(output.includes('./Counter.tsx"'), true);
});

Deno.test("generateIslandWrapper: exports default hydrate function", () => {
  const output = generateIslandWrapper("Counter");
  assertEquals(output.includes("export default function hydrate"), true);
});

Deno.test("generateIslandWrapper: includes correct island name in error message", () => {
  const output = generateIslandWrapper("SearchBar");
  assertEquals(output.includes("Failed to hydrate island SearchBar"), true);
});

Deno.test("generateIslandWrapper: generates valid TypeScript for different names", () => {
  const names = ["Counter", "SearchBar", "Modal", "DataTable"];
  for (const name of names) {
    const output = generateIslandWrapper(name);
    assertEquals(
      output.includes(`./${name}.tsx"`),
      true,
      `Missing import for ${name}`,
    );
    assertEquals(
      output.includes(`hydrate island ${name}`),
      true,
      `Missing error msg for ${name}`,
    );
  }
});
