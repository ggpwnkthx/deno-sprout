// Tests for the `slash` normalizer and the `isInsideRoot` containment
// helper. These two primitives are the foundation for every path
// comparison in the rest of the workspace, so the test surface is
// deliberately exhaustive.
import { assertEquals } from "jsr:@std/assert@1";
import { isInsideRoot, slash } from "./path.ts";

Deno.test("slash converts backslashes to forward slashes", () => {
  assertEquals(slash("a\\b/c"), "a/b/c");
  assertEquals(slash("C:\\a\\b"), "C:/a/b");
});

Deno.test("slash collapses runs of forward slashes", () => {
  assertEquals(slash("a//b"), "a/b");
  assertEquals(slash("a///b"), "a/b");
  assertEquals(slash("//a//b//"), "/a/b");
});

Deno.test("slash strips a trailing slash but preserves the root", () => {
  assertEquals(slash("a/"), "a");
  assertEquals(slash("/a/"), "/a");
  assertEquals(slash("/"), "/");
});

Deno.test("slash strips a leading './'", () => {
  assertEquals(slash("./a"), "a");
  assertEquals(slash("./"), "");
});

Deno.test("isInsideRoot returns true for the root itself", () => {
  assertEquals(isInsideRoot("/proj", "/proj"), true);
});

Deno.test("isInsideRoot returns true for a path strictly inside root", () => {
  assertEquals(isInsideRoot("/proj/sub", "/proj"), true);
  assertEquals(isInsideRoot("/proj/a/b/c.tsx", "/proj"), true);
});

Deno.test("isInsideRoot rejects sibling-prefix escapes", () => {
  assertEquals(isInsideRoot("/proj-evil", "/proj"), false);
  assertEquals(isInsideRoot("/proj2", "/proj"), false);
});

Deno.test("isInsideRoot rejects empty root", () => {
  assertEquals(isInsideRoot("/proj", ""), false);
});

Deno.test("isInsideRoot rejects NUL bytes in either argument", () => {
  assertEquals(isInsideRoot("/proj/\0evil", "/proj"), false);
  assertEquals(isInsideRoot("/proj", "/proj/\0evil"), false);
  assertEquals(isInsideRoot("/proj\0", "/proj"), false);
});

Deno.test("isInsideRoot rejects relative paths", () => {
  assertEquals(isInsideRoot("proj/sub", "/proj"), false);
  assertEquals(isInsideRoot("/proj", "proj"), false);
});

Deno.test("isInsideRoot normalizes both arguments before comparison", () => {
  // Backslashes in the candidate are normalized to forward slashes
  // before containment is checked.
  assertEquals(isInsideRoot("/proj\\sub", "/proj"), true);
  // Repeated slashes in the root are also normalized.
  assertEquals(isInsideRoot("/proj/sub", "/proj//"), true);
});
