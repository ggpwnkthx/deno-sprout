// Tests for the `acceptsGzip` `Accept-Encoding` header parser.
//
// The helper is a pure string function; tests run without any
// filesystem or network setup. The test matrix mirrors the
// RFC 7231 §5.3.4 q-value semantics plus the case-insensitivity
// and whitespace-tolerance rules spelled out in the file JSDoc.
import { assertEquals } from "jsr:@std/assert@1";
import { acceptsGzip } from "./http.ts";

Deno.test("acceptsGzip: null / undefined / empty header -> false", () => {
  assertEquals(acceptsGzip(null), false);
  assertEquals(acceptsGzip(undefined), false);
  assertEquals(acceptsGzip(""), false);
  assertEquals(acceptsGzip("   "), false);
});

Deno.test("acceptsGzip: 'gzip' alone -> true", () => {
  assertEquals(acceptsGzip("gzip"), true);
});

Deno.test("acceptsGzip: 'gzip;q=0' -> false (explicit refusal)", () => {
  assertEquals(acceptsGzip("gzip;q=0"), false);
  assertEquals(acceptsGzip("gzip;q=0.0"), false);
});

Deno.test("acceptsGzip: wildcard '*' -> true", () => {
  assertEquals(acceptsGzip("*"), true);
});

Deno.test("acceptsGzip: 'identity;q=1, gzip;q=0.5' -> false (identity preferred)", () => {
  // The function implements a binary yes/no. identity is the default,
  // and gzip's q is below 1, so the implementation is allowed to
  // return raw bytes. The exact behavior is documented in the file
  // JSDoc.
  assertEquals(acceptsGzip("identity;q=1, gzip;q=0.5"), false);
});

Deno.test("acceptsGzip: 'deflate, gzip' -> true (multi-entry)", () => {
  assertEquals(acceptsGzip("deflate, gzip"), true);
});

Deno.test("acceptsGzip: 'deflate, gzip;q=0' -> false (gzip refused)", () => {
  assertEquals(acceptsGzip("deflate, gzip;q=0"), false);
});

Deno.test("acceptsGzip: 'GZIP' / 'Gzip' -> true (case-insensitive)", () => {
  assertEquals(acceptsGzip("GZIP"), true);
  assertEquals(acceptsGzip("Gzip"), true);
});

Deno.test("acceptsGzip: 'gzip; q=0' (with whitespace) -> false", () => {
  assertEquals(acceptsGzip("gzip; q=0"), false);
});

Deno.test("acceptsGzip: 'gzip;q=1' -> true (explicit q-value, default weight)", () => {
  assertEquals(acceptsGzip("gzip;q=1"), true);
});

Deno.test("acceptsGzip: 'gzip;q=0.0001' -> false (any non-positive q)", () => {
  assertEquals(acceptsGzip("gzip;q=0.0001"), false);
});

Deno.test("acceptsGzip: 'gzip;q=2' -> false (q > 1 is malformed)", () => {
  assertEquals(acceptsGzip("gzip;q=2"), false);
  assertEquals(acceptsGzip("gzip;q=1.5"), false);
});

Deno.test("acceptsGzip: 'br, gzip' -> true (Brotli listed but gzip still accepted)", () => {
  assertEquals(acceptsGzip("br, gzip"), true);
});

Deno.test("acceptsGzip: 'identity' -> false (no gzip offered)", () => {
  assertEquals(acceptsGzip("identity"), false);
});

Deno.test("acceptsGzip: empty entries and stray commas are tolerated", () => {
  // ",, gzip" has two empty entries before the gzip coding; the
  // parser must skip them and still return true.
  assertEquals(acceptsGzip(",, gzip"), true);
  // A trailing comma yields an empty entry but does not change the
  // answer for the only real entry.
  assertEquals(acceptsGzip("gzip,"), true);
});

Deno.test("acceptsGzip: 'gzip;level=5' (non-q parameter) keeps the default q=1", () => {
  // The q-value defaults to 1 when no `q=` parameter is present.
  // The presence of an unrelated `level=` parameter must not
  // confuse the parser.
  assertEquals(acceptsGzip("gzip;level=5"), true);
});

Deno.test("acceptsGzip: q-value parsing is robust to whitespace and extra params", () => {
  // `gzip ; q=0 ; foo=bar` → q=0, refused.
  assertEquals(acceptsGzip("gzip ; q=0 ; foo=bar"), false);
  // `gzip;foo=bar` → no q parameter, defaults to 1, accepted.
  assertEquals(acceptsGzip("gzip;foo=bar"), true);
  // `gzip;foo=bar;q=0` → q=0, refused.
  assertEquals(acceptsGzip("gzip;foo=bar;q=0"), false);
});
