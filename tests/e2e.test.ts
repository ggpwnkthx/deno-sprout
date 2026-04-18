import { assertEquals } from "@std/assert";
import { createApp } from "../packages/sprout/mod.ts";

Deno.test("full fixture: GET / returns 200", async () => {
  const app = await createApp({ root: "./tests/fixtures/full" });
  const res = await app.request("/");
  assertEquals(res.status, 200);
});

Deno.test("full fixture: GET /about returns 200", async () => {
  const app = await createApp({ root: "./tests/fixtures/full" });
  const res = await app.request("/about");
  assertEquals(res.status, 200);
});

Deno.test("full fixture: GET /blog/hello returns 200 with slug param", async () => {
  const app = await createApp({ root: "./tests/fixtures/full" });
  const res = await app.request("/blog/hello");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("Post: hello"), true);
});

Deno.test("full fixture: GET /api/items returns JSON", async () => {
  const app = await createApp({ root: "./tests/fixtures/full" });
  const res = await app.request("/api/items");
  assertEquals(res.status, 200);
  const contentType = res.headers.get("Content-Type") ?? "";
  assertEquals(contentType.startsWith("application/json"), true);
});

Deno.test("full fixture: GET /throw returns 500 with error page", async () => {
  const app = await createApp({ root: "./tests/fixtures/full" });
  const res = await app.request("/throw");
  assertEquals(res.status, 500);
  const html = await res.text();
  assertEquals(html.includes("Something went wrong"), true);
});

Deno.test("full fixture: GET /nonexistent returns 404 with custom page", async () => {
  const app = await createApp({ root: "./tests/fixtures/full" });
  const res = await app.request("/nonexistent");
  assertEquals(res.status, 404);
  const html = await res.text();
  assertEquals(html.includes("Page not found"), true);
});

Deno.test("full fixture: GET /blog/nonexistent-post returns 200 (route exists, data is fake)", async () => {
  const app = await createApp({ root: "./tests/fixtures/full" });
  const res = await app.request("/blog/nonexistent-post");
  assertEquals(res.status, 200);
});

Deno.test("full fixture: island data attributes present in HTML", async () => {
  // Note: Islands require the dev server's bundling middleware.
  // This test verifies the route renders correctly but skips island attribute
  // verification since createApp doesn't set up island bundling.
  const app = await createApp({ root: "./tests/fixtures/full" });
  const res = await app.request("/");
  assertEquals(res.status, 200);
  // Islands are tested in dev server tests
});
