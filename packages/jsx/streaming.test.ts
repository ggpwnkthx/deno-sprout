import { assertEquals, assertStringIncludes } from "@std/assert";
import { renderToString } from "./streaming.ts";

Deno.test("renderToString returns a string for string input", async () => {
  const result = await renderToString("hello");
  assertEquals(typeof result, "string");
  assertStringIncludes(result, "hello");
});

Deno.test("renderToString handles empty string", async () => {
  const result = await renderToString("");
  assertEquals(result, "");
});

Deno.test("renderToString returns non-empty string for non-empty input", async () => {
  const result = await renderToString("test content");
  assertStringIncludes(result, "test content");
});
