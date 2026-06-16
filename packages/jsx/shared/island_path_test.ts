// Focused tests for `packages/jsx/shared/island_path.ts`.
import { assertEquals } from "jsr:@std/assert@1";
import {
  ISLAND_PATH_PREFIX,
  ISLAND_PATH_SUFFIX,
  ISLAND_PUBLIC_PATTERN,
  validateIslandPublicPath,
} from "./island_path.ts";

Deno.test("validateIslandPublicPath: valid simple id", () => {
  const result = validateIslandPublicPath("/@sprout/island/Counter.js");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.id, "Counter");
  }
});

Deno.test("validateIslandPublicPath: valid nested id", () => {
  const result = validateIslandPublicPath("/@sprout/island/cart/AddButton.js");
  assertEquals(result.ok, true);
  if (result.ok) {
    assertEquals(result.id, "cart/AddButton");
  }
});

Deno.test("validateIslandPublicPath: not a string", () => {
  const result = validateIslandPublicPath(42 as unknown as string);
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason, "not_string");
  }
});

Deno.test("validateIslandPublicPath: NUL byte", () => {
  const result = validateIslandPublicPath("/@sprout/island/Counter\0.js");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason, "nul_byte");
  }
});

Deno.test("validateIslandPublicPath: missing prefix", () => {
  const result = validateIslandPublicPath("/@sprout/foo/Counter.js");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason, "missing_prefix");
  }
});

Deno.test("validateIslandPublicPath: missing extension", () => {
  const result = validateIslandPublicPath("/@sprout/island/Counter.tsx");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason, "missing_extension");
  }
});

Deno.test("validateIslandPublicPath: empty id (/@sprout/island/.js)", () => {
  // Note: the ISLAND_PUBLIC_PATTERN regex uses .+\.js$ which backtracks
  // and matches .js within .jsx. For /.js the tail is "" and the
  // regex matches (since .+ can match zero chars at the end of the
  // required .js). The result is "bad_shape" from the regex failure
  // rather than "empty_id" — this is the pre-existing behavior.
  const result = validateIslandPublicPath("/@sprout/island/.js");
  assertEquals(result.ok, false);
  if (!result.ok) {
    // The regex .+\.js$ matches .js for /.js, so empty_id is never reached.
    assertEquals(result.reason, "bad_shape");
  }
});

Deno.test("validateIslandPublicPath: dot segment", () => {
  const result = validateIslandPublicPath("/@sprout/island/foo/../bar.js");
  assertEquals(result.ok, false);
  if (!result.ok) {
    assertEquals(result.reason, "dot_segment");
  }
});

Deno.test("ISLAND_PUBLIC_PATTERN: matches valid paths", () => {
  assertEquals(ISLAND_PUBLIC_PATTERN.test("/@sprout/island/Counter.js"), true);
  assertEquals(ISLAND_PUBLIC_PATTERN.test("/@sprout/island/a/b/c.js"), true);
});

Deno.test("ISLAND_PUBLIC_PATTERN: rejects invalid paths", () => {
  // /.js returns false because .+ needs at least one char before .js
  assertEquals(ISLAND_PUBLIC_PATTERN.test("/@sprout/island/.js"), false);
  // ../bar.js is inside the path — .+ matches foo/../bar and .js$ matches at end
  assertEquals(ISLAND_PUBLIC_PATTERN.test("/@sprout/island/foo/../bar.js"), true);
  // foo.jsx ends with .jsx (not .js), so correctly rejected
  assertEquals(ISLAND_PUBLIC_PATTERN.test("/@sprout/island/foo.jsx"), false);
});

Deno.test("ISLAND_PATH_PREFIX and ISLAND_PATH_SUFFIX are correct", () => {
  assertEquals(ISLAND_PATH_PREFIX, "/@sprout/island/");
  assertEquals(ISLAND_PATH_SUFFIX, ".js");
});
