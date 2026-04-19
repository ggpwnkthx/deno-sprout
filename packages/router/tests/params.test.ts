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

Deno.test("extractParams for mixed static and param segments returns only matching", () => {
  // Only :id and :commentId are extracted, not the static /users/ or /posts/
  const result = extractParams("/users/:id/posts/:commentId", {
    id: "42",
    commentId: "99",
  });
  assertEquals(result, { id: "42", commentId: "99" });
});

Deno.test("extractParams for pattern with no named params returns empty", () => {
  assertEquals(extractParams("/blog/static/path", {}), {});
});

Deno.test("extractParams for catch-all at root returns rest param", () => {
  assertEquals(extractParams("/*", { "*": "foo/bar" }), { rest: "foo/bar" });
});

Deno.test("extractParams for [...rest] catch-all style maps correctly", () => {
  assertEquals(
    extractParams("/a/b/[...rest]", { "*": "x/y/z" }),
    { rest: "x/y/z" },
  );
});

Deno.test("extractParams for pattern with only catch-all returns rest", () => {
  assertEquals(extractParams("/[...rest]", { "*": "deep/nested/path" }), {
    rest: "deep/nested/path",
  });
});
