// simplehash.test.ts — Standalone unit tests for simpleHash
import { assertEquals, assertNotEquals } from "@std/assert";
import { simpleHash } from "../hydrator.ts";

Deno.test("simpleHash: is deterministic", () => {
  const h1 = simpleHash("hello world");
  const h2 = simpleHash("hello world");
  assertEquals(h1, h2);
});

Deno.test("simpleHash: differs for single-character edits", () => {
  assertNotEquals(simpleHash("hello"), simpleHash("hellp"));
  assertNotEquals(simpleHash("abc"), simpleHash("abd"));
  assertNotEquals(simpleHash("a"), simpleHash("b"));
});

Deno.test("simpleHash: differs for prefix/suffix changes", () => {
  assertNotEquals(simpleHash("Counter"), simpleHash("Counter1"));
  assertNotEquals(simpleHash("a"), simpleHash("aa"));
  assertNotEquals(simpleHash("ab"), simpleHash("abc"));
});

Deno.test("simpleHash: differs for reordered characters", () => {
  assertNotEquals(simpleHash("ab"), simpleHash("ba"));
  assertNotEquals(simpleHash("abc"), simpleHash("cba"));
});

Deno.test("simpleHash: empty string produces a hash (zero)", () => {
  // Empty string: loop never runs, hash stays 0, abs(0)=0, toString(36)="0"
  assertEquals(simpleHash(""), "0");
});

Deno.test("simpleHash: handles unicode (emoji)", () => {
  // Emoji strings should not crash and should produce consistent results
  const h = simpleHash("🚀");
  assertEquals(typeof h, "string");
  assertEquals(h.length > 0, true);
  assertEquals(simpleHash("🚀"), h); // deterministic
});

Deno.test("simpleHash: handles long strings", () => {
  const long = "a".repeat(1000);
  const h = simpleHash(long);
  assertEquals(typeof h, "string");
  assertEquals(h.length > 0, true);
  // Should still be deterministic
  assertEquals(simpleHash(long), h);
});

Deno.test("simpleHash: output is always a positive integer string (Math.abs)", () => {
  // Hash must never start with "-" after Math.abs
  const inputs = [
    "a",
    "z",
    "zz",
    "zzz",
    "hello",
    "world",
    "Counter",
    "SearchBar",
    "",
    "🚀",
    "🎉🎊",
    "{name: 'foo', count: 42}",
    "💩", // high code point
  ];
  for (const input of inputs) {
    const h = simpleHash(input);
    assertEquals(
      h.startsWith("-"),
      false,
      `Hash of "${input}" started with "-": ${h}`,
    );
  }
});

Deno.test("simpleHash: output is a short base-36 string (32-bit integer)", () => {
  // A 32-bit integer in base-36 is at most 7 characters
  const inputs = ["a", "hello", "Counter", "SearchBar", "DataTable", "🚀"];
  for (const input of inputs) {
    const h = simpleHash(input);
    assertEquals(
      h.length <= 7,
      true,
      `Hash of "${input}" exceeded 7 chars: ${h} (length ${h.length})`,
    );
  }
});

Deno.test("simpleHash: collision resistance across common island prop patterns", () => {
  const keys = [
    '{"name":"Counter","count":0}',
    '{"name":"Counter","count":1}',
    '{"name":"Counter","count":2}',
    '{"name":"Counter","count":10}',
    '{"name":"SearchBar","query":""}',
    '{"name":"SearchBar","query":"a"}',
    '{"name":"SearchBar","query":"ab"}',
  ];
  const hashes = keys.map((k) => simpleHash(k));
  // All hashes must be unique
  const unique = new Set(hashes);
  assertEquals(
    unique.size,
    hashes.length,
    `Collisions detected in ${JSON.stringify(keys)}: ${hashes}`,
  );
});

Deno.test("simpleHash: base-36 charset only (no uppercase or special chars)", () => {
  const h = simpleHash("Hello World 123 !@#");
  // base-36 uses 0-9 and a-z
  assertEquals(/^[0-9a-z]+$/.test(h), true, `Unexpected hash format: ${h}`);
});
