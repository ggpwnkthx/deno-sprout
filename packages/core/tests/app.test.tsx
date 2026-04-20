// @jsxImportSource @hono/hono
import { assertEquals } from "@std/assert";
import { App } from "@ggpwnkthx/sprout-core/app";
import { define } from "@ggpwnkthx/sprout-core/lib/define";
import type { LayoutComponent } from "@ggpwnkthx/sprout-core/types";

// ---------------------------------------------------------------------------
// App class unit tests (no file I/O needed)
// ---------------------------------------------------------------------------

Deno.test("App constructor accepts no arguments", () => {
  const app = new App();
  assertEquals(typeof app.fetch, "function");
});

Deno.test("App constructor accepts partial options", () => {
  const app = new App({ root: "/tmp" });
  assertEquals(typeof app.fetch, "function");
});

Deno.test("App constructor accepts all options", () => {
  const app = new App({
    root: "/tmp",
    routesDir: "custom-routes",
    staticDir: "custom-static",
    distDir: "custom-dist",
  });
  assertEquals(typeof app.fetch, "function");
});

Deno.test("App instance has expected HTTP methods on interface", () => {
  const app = new App();
  // Verify app has standard Hono routing methods
  assertEquals(typeof app.get, "function");
  assertEquals(typeof app.post, "function");
  assertEquals(typeof app.put, "function");
  assertEquals(typeof app.delete, "function");
  assertEquals(typeof app.patch, "function");
  assertEquals(typeof app.on, "function");
  assertEquals(typeof app.use, "function");
  assertEquals(typeof app.notFound, "function");
  assertEquals(typeof app.onError, "function");
});

// ---------------------------------------------------------------------------
// App with functional routes (using Hono's built-in routing)
// ---------------------------------------------------------------------------

Deno.test("App can register a simple GET handler", async () => {
  const app = new App();
  app.get("/hello", (c) => c.text("Hello, World!"));
  const res = await app.request("/hello");
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "Hello, World!");
});

Deno.test("App handles 404 for unregistered routes", async () => {
  const app = new App();
  const res = await app.request("/nonexistent");
  assertEquals(res.status, 404);
});

Deno.test("App accepts a rootLayout option", () => {
  // Verify rootLayout option is stored in the app without throwing
  const customLayout: LayoutComponent = ({ children }) => (
    <div class="wrapper">{children}</div>
  );
  const app = new App({ rootLayout: customLayout });
  // App is constructed successfully with rootLayout — the layout is stored
  // in #appOptions and used during init() when routes are registered.
  assertEquals(typeof app.fetch, "function");
});

Deno.test("App can be created and a request made in sequence", async () => {
  const app = new App();
  app.get("/test", (c) => c.json({ ok: true }));
  const res = await app.request("/test");
  assertEquals(res.status, 200);
  const json = await res.json();
  assertEquals(json, { ok: true });
});

// ---------------------------------------------------------------------------
// define.handlers integration — bare function becomes GET
// ---------------------------------------------------------------------------

Deno.test("define.handlers with bare function registers GET handler", async () => {
  const app = new App();
  const wrapped = define.handlers((c) => c.text("bare handler"));
  // define.handlers returns Handlers: { GET: Handler } when passed a bare fn
  app.get("/bare", wrapped.GET!);
  const res = await app.request("/bare");
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "bare handler");
});

Deno.test("define.handlers with Handlers object registers all methods", async () => {
  const app = new App();
  const handlers = define.handlers({
    GET: (c) => c.text("get"),
    POST: (c) => c.text("post"),
    DELETE: (c) => c.text("delete"),
  });
  app.get("/api-get", handlers.GET!);
  app.post("/api-post", handlers.POST!);
  app.delete("/api-delete", handlers.DELETE!);

  const getRes = await app.request("/api-get", { method: "GET" });
  assertEquals(getRes.status, 200);
  assertEquals(await getRes.text(), "get");

  const postRes = await app.request("/api-post", { method: "POST" });
  assertEquals(postRes.status, 200);
  assertEquals(await postRes.text(), "post");

  const delRes = await app.request("/api-delete", { method: "DELETE" });
  assertEquals(delRes.status, 200);
  assertEquals(await delRes.text(), "delete");
});
