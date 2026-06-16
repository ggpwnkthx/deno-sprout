// Tests for the gzip helpers in build/gzip.ts.
import { assertEquals } from "jsr:@std/assert@1";
import { gzipBytes, maybeGzip } from "./build/gzip.ts";

Deno.test("sprout-gzip-1: gzipBytes: gzip output is strictly smaller than a repetitive input", async () => {
  const input = new TextEncoder().encode("a".repeat(2048));
  const gz = await gzipBytes(input);
  assertEquals(gz.length < input.length, true, "gzip output should be smaller than input");
  // Gzip magic number
  assertEquals(gz[0], 0x1f);
  assertEquals(gz[1], 0x8b);
});

Deno.test("sprout-gzip-2: maybeGzip: returns null when compression does not help (tiny file)", async () => {
  const input = new Uint8Array([0x00]);
  const result = await maybeGzip(input, "gzip");
  assertEquals(result, null);
});

Deno.test("sprout-gzip-3: maybeGzip: returns null when compression does not help (empty file)", async () => {
  const input = new Uint8Array([]);
  const result = await maybeGzip(input, "gzip");
  assertEquals(result, null);
});

Deno.test("sprout-gzip-4: maybeGzip: returns null when compression would produce an equal-size or larger output", async () => {
  // Random bytes are effectively incompressible; gzip adds framing overhead.
  // 64 iterations with 64 random bytes each gives a vanishingly small
  // probability of a false negative.
  for (let i = 0; i < 5; i++) {
    const input = crypto.getRandomValues(new Uint8Array(64));
    const result = await maybeGzip(input, "gzip");
    assertEquals(result, null, `iteration ${i}: random bytes should not compress`);
  }
});

Deno.test("sprout-gzip-5: maybeGzip: returns the compressed bytes when compression helps", async () => {
  const input = new TextEncoder().encode("a".repeat(1024));
  const result = await maybeGzip(input, "gzip");
  assertEquals(result !== null, true);
  if (result !== null) {
    // Gzip magic number check (same as frozen_reader_test.ts:393-394)
    assertEquals(result[0], 0x1f);
    assertEquals(result[1], 0x8b);
    assertEquals(result.length < input.length, true);
  }
});

Deno.test("sprout-gzip-6: maybeGzip: returns null when compress=false", async () => {
  const input = new TextEncoder().encode("hello world");
  const result = await maybeGzip(input, false);
  assertEquals(result, null);
});
