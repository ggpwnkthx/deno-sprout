import { assertEquals, assertStrictEquals } from "@std/assert";
import { defineMiddleware, type MiddlewareHandler } from "../lib/middleware.ts";
import { Hono } from "@hono/hono";

Deno.test("defineMiddleware returns the same handler", () => {
  const handler: MiddlewareHandler = (_c, next) => next();
  const result = defineMiddleware(handler);
  assertStrictEquals(result, handler);
});

Deno.test("defineMiddleware preserves handler identity across multiple calls", () => {
  const handler: MiddlewareHandler = (_c, next) => next();
  const first = defineMiddleware(handler);
  const second = defineMiddleware(handler);
  assertStrictEquals(first, second);
  assertStrictEquals(first, handler);
});

Deno.test("defineMiddleware returns a callable middleware that sets a header", async () => {
  const handler: MiddlewareHandler = (c, next) => {
    c.header("X-Middleware", "applied");
    return next();
  };
  const wrapped = defineMiddleware(handler);

  const app = new Hono();
  app.use("*", wrapped);
  app.get("/", (c) => c.text("ok"));

  const res = await app.request("/");
  assertStrictEquals(res.headers.get("X-Middleware"), "applied");
});

Deno.test("defineMiddleware middleware short-circuits with a response", async () => {
  // The wrapped middleware is typed as MiddlewareHandler (no Hono Variables).
  // Hono's app.use() requires MiddlewareHandler<HonoVariables>, so we must
  // bridge the gap with Parameters<typeof app.use>[1] — the actual middleware slot type.
  // This is safe because defineMiddleware returns the original handler unchanged;
  // the cast only widens the variable context, not the handler behavior.
  const blocked: MiddlewareHandler = async (c) => {
    return await c.text("blocked", 403);
  };
  const wrapped = defineMiddleware(blocked);

  const app = new Hono();
  app.use("*", wrapped as unknown as Parameters<typeof app.use>[1]);
  app.get("/", (c) => c.text("should not reach here"));

  const res = await app.request("/");
  assertEquals(res.status, 403);
  assertEquals(await res.text(), "blocked");
});

Deno.test("defineMiddleware chained in app — runs before route handler", async () => {
  const app = new Hono();

  const firstMw = defineMiddleware((c, next) => {
    c.header("X-First", "1");
    return next();
  });
  const secondMw = defineMiddleware((c, next) => {
    c.header("X-Second", "2");
    return next();
  });

  app.use("*", firstMw);
  app.use("*", secondMw);
  app.get("/", (c) => c.text("ok"));

  const res = await app.request("/");
  assertEquals(res.headers.get("X-First"), "1");
  assertEquals(res.headers.get("X-Second"), "2");
});
