import { assertEquals } from "@std/assert";
import { extractParams } from "../lib/params.ts";

Deno.test("extractParams for static routes returns empty object", () => {
  assertEquals(extractParams("/about", {}), {});
});

Deno.test("extractParams for :param routes returns the param", () => {
  assertEquals(extractParams("/blog/:slug", { slug: "hello" }), {
    slug: "hello",
  });
});

Deno.test("extractParams for catch-all maps * back to declared name", () => {
  assertEquals(extractParams("/blog/*", { "*": "a/b/c" }), { rest: "a/b/c" });
});
