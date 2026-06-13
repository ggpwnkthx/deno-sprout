// Tests for the `patternToHono` translator.
//
// The translator strips the `{...}` regex constraint from a
// manifest `RoutePattern` so it can be passed to a Hono route
// registration. M3 is intentionally lossy here: the constraint is
// dropped to keep the wire format portable.
import { assertEquals } from "jsr:@std/assert@1";
import { patternToHono } from "./server/pattern_to_hono.ts";

Deno.test("patternToHono: identity for simple patterns", () => {
  assertEquals(patternToHono("/"), "/");
  assertEquals(patternToHono("/about"), "/about");
  assertEquals(patternToHono("/blog/:slug"), "/blog/:slug");
});

Deno.test("patternToHono: strips a single-segment regex constraint", () => {
  assertEquals(patternToHono("/items/:id{[0-9]+}"), "/items/:id");
  assertEquals(patternToHono("/blog/:slug{[^/]+}"), "/blog/:slug");
});

Deno.test("patternToHono: strips the catch-all constraint", () => {
  // The M3 spec test: `/files/:path{.+}` → `/files/:path`.
  assertEquals(patternToHono("/files/:path{.+}"), "/files/:path");
});

Deno.test("patternToHono: leaves non-parameter segments alone", () => {
  assertEquals(patternToHono("/api/v1/users"), "/api/v1/users");
  assertEquals(patternToHono("/blog/:slug/edit"), "/blog/:slug/edit");
});

Deno.test("patternToHono: handles mixed constrained and unconstrained params", () => {
  assertEquals(
    patternToHono("/a/:x{[^/]+}/b/:y{.*}/c/:z"),
    "/a/:x/b/:y/c/:z",
  );
});
