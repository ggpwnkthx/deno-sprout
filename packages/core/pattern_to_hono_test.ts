// Tests for the `patternToHono` translator.
//
// The translator preserves Hono-compatible `{...}` regex constraints
// from the manifest `RoutePattern`, including catch-all route
// constraints.
import { assertEquals } from "jsr:@std/assert@1";
import { patternToHono } from "./server/pattern_to_hono.ts";

Deno.test("patternToHono: identity for simple patterns", () => {
  assertEquals(patternToHono("/"), "/");
  assertEquals(patternToHono("/about"), "/about");
  assertEquals(patternToHono("/blog/:slug"), "/blog/:slug");
});

Deno.test("patternToHono: preserves a single-segment regex constraint", () => {
  assertEquals(patternToHono("/items/:id{[0-9]+}"), "/items/:id{[0-9]+}");
  assertEquals(patternToHono("/blog/:slug{[^/]+}"), "/blog/:slug{[^/]+}");
});

Deno.test("patternToHono: preserves the catch-all constraint", () => {
  assertEquals(patternToHono("/files/:path{.+}"), "/files/:path{.+}");
});

Deno.test("patternToHono: leaves non-parameter segments alone", () => {
  assertEquals(patternToHono("/api/v1/users"), "/api/v1/users");
  assertEquals(patternToHono("/blog/:slug/edit"), "/blog/:slug/edit");
});

Deno.test("patternToHono: handles mixed constrained and unconstrained params", () => {
  assertEquals(
    patternToHono("/a/:x{[^/]+}/b/:y{.*}/c/:z"),
    "/a/:x{[^/]+}/b/:y{.*}/c/:z",
  );
});
