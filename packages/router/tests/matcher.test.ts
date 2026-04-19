import { assertEquals } from "@std/assert";
import { generatePath, matchRoute } from "../matcher.ts";

Deno.test("matchRoute - exact string pattern match", () => {
  const result = matchRoute("/about", "/about");
  assertEquals(result, { pattern: "/about", params: {} });
});

Deno.test("matchRoute - string pattern non-match", () => {
  const result = matchRoute("/about", "/other");
  assertEquals(result, null);
});

Deno.test("matchRoute - URLPattern with named params", () => {
  const pattern = new URLPattern({ pathname: "/blog/:slug" });
  const result = matchRoute(pattern, "https://example.com/blog/my-post");
  assertEquals(result?.pattern, "/blog/:slug");
  assertEquals(result?.params, { slug: "my-post" });
});

Deno.test("matchRoute - URLPattern with catch-all", () => {
  const pattern = new URLPattern({ pathname: "/blog/*" });
  const result = matchRoute(pattern, "https://example.com/blog/a/b/c");
  assertEquals(result?.pattern, "/blog/*");
});

Deno.test("matchRoute - URLPattern with no match", () => {
  const pattern = new URLPattern({ pathname: "/blog/:slug" });
  const result = matchRoute(pattern, "https://example.com/about");
  assertEquals(result, null);
});

Deno.test("matchRoute - URLPattern with multiple named params", () => {
  const pattern = new URLPattern({ pathname: "/users/:id/posts/:postId" });
  const result = matchRoute(pattern, "https://example.com/users/123/posts/456");
  assertEquals(result?.pattern, "/users/:id/posts/:postId");
  assertEquals(result?.params, { id: "123", postId: "456" });
});

Deno.test("generatePath - simple pattern with no params", () => {
  const result = generatePath("/about");
  assertEquals(result, "/about");
});

Deno.test("generatePath - pattern with single param substitution", () => {
  const result = generatePath("/blog/:slug", { slug: "my-post" });
  assertEquals(result, "/blog/my-post");
});

Deno.test("generatePath - pattern with multiple param substitutions", () => {
  const result = generatePath("/users/:id/posts/:postId", {
    id: "123",
    postId: "456",
  });
  assertEquals(result, "/users/123/posts/456");
});

Deno.test("generatePath - pattern with missing params", () => {
  const result = generatePath("/blog/:slug", {});
  assertEquals(result, "/blog/");
});

Deno.test("generatePath - pattern with extra params", () => {
  const result = generatePath("/blog/:slug", {
    slug: "my-post",
    extra: "ignored",
  });
  assertEquals(result, "/blog/my-post");
});

// ---------------------------------------------------------------------------
// matchRoute edge cases
// ---------------------------------------------------------------------------

Deno.test("matchRoute - URLPattern with trailing slash only matches URL with trailing slash", () => {
  const pattern = new URLPattern({ pathname: "/about/" });
  // Exact pathname match required - /about/ does NOT match /about
  const result = matchRoute(pattern, "https://example.com/about/");
  assertEquals(result !== null, true);
  const noSlashResult = matchRoute(pattern, "https://example.com/about");
  assertEquals(noSlashResult, null);
});

Deno.test("matchRoute - string pattern with leading slash mismatch", () => {
  const result = matchRoute("/about", "about");
  assertEquals(result, null);
});

Deno.test("matchRoute - URLPattern with query and hash does not affect pathname match", () => {
  const pattern = new URLPattern({ pathname: "/blog/:slug" });
  const result = matchRoute(
    pattern,
    "https://example.com/blog/my-post?tag=tech#top",
  );
  assertEquals(result?.params, { slug: "my-post" });
});

// ---------------------------------------------------------------------------
// generatePath edge cases
// ---------------------------------------------------------------------------

Deno.test("generatePath - empty pattern returns empty string", () => {
  const result = generatePath("", {});
  assertEquals(result, "");
});

Deno.test("generatePath - pattern with no params returns pattern unchanged", () => {
  const result = generatePath("/static/path", {});
  assertEquals(result, "/static/path");
});

Deno.test("generatePath - param at the end of pattern", () => {
  const result = generatePath("/users/:id", { id: "123" });
  assertEquals(result, "/users/123");
});

Deno.test("generatePath - param at the start of pattern", () => {
  const result = generatePath("/:version/api", { version: "v2" });
  assertEquals(result, "/v2/api");
});

Deno.test("generatePath - multiple consecutive params", () => {
  const result = generatePath("/:a/:b/:c", { a: "x", b: "y", c: "z" });
  assertEquals(result, "/x/y/z");
});
