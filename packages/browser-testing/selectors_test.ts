/**
 * @ggpwnkthx/sprout-browser-testing
 *
 * Tests for browser-testing utilities.
 */

import { cssEscape } from "./selectors.ts";
import { assertEquals } from "@std/assert";

Deno.test("cssEscape escapes single quotes", () => {
  assertEquals(cssEscape("it's"), "it\\'s");
});

Deno.test("cssEscape escapes double quotes", () => {
  assertEquals(cssEscape('say "hello"'), 'say \\"hello\\"');
});

Deno.test("cssEscape escapes backslashes", () => {
  assertEquals(cssEscape("path\\to\\file"), "path\\\\to\\\\file");
});

Deno.test("cssEscape escapes brackets", () => {
  assertEquals(cssEscape("item[0]"), "item\\[0\\]");
});

Deno.test("cssEscape handles newlines without passing them through literally", () => {
  // Newline (code 10) should be escaped, not appear as-is
  const result = cssEscape("line\nbreak");
  assertEquals(result.includes("\n"), false, "newline should be escaped");
  assertEquals(result.startsWith("line"), true);
});

Deno.test("cssEscape escapes carriage returns", () => {
  const result = cssEscape("line\rbreak");
  assertEquals(result.includes("\r"), false, "CR should be escaped");
});

Deno.test("cssEscape escapes control characters", () => {
  const result = cssEscape("a\x00b");
  assertEquals(result.includes("\x00"), false, "NUL should be escaped");
});

Deno.test("cssEscape handles empty string", () => {
  assertEquals(cssEscape(""), "");
});

Deno.test("cssEscape handles plain ASCII", () => {
  assertEquals(cssEscape("hello world"), "hello world");
});
