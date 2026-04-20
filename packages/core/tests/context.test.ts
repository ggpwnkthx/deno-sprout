import { assertEquals } from "@std/assert";
import type {
  Context,
  MiddlewareHandler,
  SproutContext,
} from "@ggpwnkthx/sprout-core/context";
import { Hono } from "@hono/hono";
import type { MiddlewareHandler as HonoMiddlewareHandler } from "@hono/hono";

// Test-only interface for sprout's extended context methods (set/get)
// not present on base Hono Context but used by the framework.
interface SproutExtendedContext {
  set(key: string, value: unknown): void;
  get(key: string): unknown;
}

Deno.test("Context is re-exported from @hono/hono", () => {
  const check: Context = {} as Context;
  void check;
});

Deno.test("SproutContext is a type alias for Context", () => {
  const _check: SproutContext = {} as Context;
  void _check;
});

Deno.test("MiddlewareHandler is a function type", () => {
  const handler: MiddlewareHandler = (c, next) => {
    void c;
    return next();
  };
  assertEquals(typeof handler, "function");
});

Deno.test("MiddlewareHandler re-export is usable as Hono middleware", async () => {
  const handler: MiddlewareHandler = (c, next) => {
    c.header("X-Test", "ok");
    return next();
  };

  const app = new Hono();
  app.use("*", handler as unknown as HonoMiddlewareHandler);
  app.get("/", (c) => c.text("ok"));

  const res = await app.request("/");
  assertEquals(res.headers.get("X-Test"), "ok");
});

// ---------------------------------------------------------------------------
// Context isolation — each request gets its own context instance
// ---------------------------------------------------------------------------

Deno.test("each request receives its own context (no cross-request leakage)", async () => {
  const app = new Hono();
  let requestCount = 0;

  app.use("*", (c, next) => {
    requestCount++;
    c.header("X-Request-Number", String(requestCount));
    return next();
  });

  app.get("/", (c) => c.text("ok"));

  const res1 = await app.request("/");
  const res2 = await app.request("/");
  const res3 = await app.request("/");

  assertEquals(res1.headers.get("X-Request-Number"), "1");
  assertEquals(res2.headers.get("X-Request-Number"), "2");
  assertEquals(res3.headers.get("X-Request-Number"), "3");
});

Deno.test("c.set and c.get work within a single request", async () => {
  const app = new Hono();

  app.use("*", (c, next) => {
    (c as unknown as SproutExtendedContext).set("greeting", "Hello, Sprout!");
    return next();
  });

  app.get("/", (c) => {
    const greeting = (c as unknown as SproutExtendedContext).get(
      "greeting",
    ) as string;
    return c.text(greeting);
  });

  const res = await app.request("/");
  assertEquals(await res.text(), "Hello, Sprout!");
});

Deno.test("c.set in earlier middleware available in later middleware and handler", async () => {
  const app = new Hono();

  app.use("*", (c, next) => {
    (c as unknown as SproutExtendedContext).set("step", "1");
    return next();
  });

  app.use("*", (c, next) => {
    const step = (c as unknown as SproutExtendedContext).get("step") as string;
    (c as unknown as SproutExtendedContext).set("step", step + "→2");
    return next();
  });

  app.get("/", (c) => {
    const step = (c as unknown as SproutExtendedContext).get("step") as string;
    return c.text(step);
  });

  const res = await app.request("/");
  assertEquals(await res.text(), "1→2");
});

Deno.test("context is available to nested middleware scoped to path pattern", async () => {
  const app = new Hono();

  app.use("/api/*", (c, next) => {
    (c as unknown as SproutExtendedContext).set("prefix", "[api]");
    return next();
  });

  app.use("/api/*", (c, next) => {
    const prefix = (c as unknown as SproutExtendedContext).get(
      "prefix",
    ) as string;
    (c as unknown as SproutExtendedContext).set(
      "prefix",
      prefix + " guarded",
    );
    return next();
  });

  app.get("/api/test", (c) => {
    const prefix = (c as unknown as SproutExtendedContext).get(
      "prefix",
    ) as string;
    return c.text(prefix);
  });

  const res = await app.request("/api/test");
  assertEquals(await res.text(), "[api] guarded");
});

// ---------------------------------------------------------------------------
// MiddlewareHandler next() short-circuit and early-return behavior
// ---------------------------------------------------------------------------

Deno.test("MiddlewareHandler that returns early prevents downstream handlers", async () => {
  const app = new Hono();

  const guard: MiddlewareHandler = (c) => {
    return Promise.resolve(c.text("Forbidden", 403));
  };

  app.use("*", guard as unknown as HonoMiddlewareHandler);
  app.get("/", (c) => c.text("This should not be reached"));

  const res = await app.request("/");
  assertEquals(res.status, 403);
  assertEquals(await res.text(), "Forbidden");
});

Deno.test("MiddlewareHandler can read request method", async () => {
  const app = new Hono();

  app.use("*", (c, next) => {
    const method = c.req.method;
    c.header("X-Method", method);
    return next();
  });

  app.post("/test", (c) => c.text("post"));
  app.get("/test", (c) => c.text("get"));

  const postRes = await app.request("/test", { method: "POST" });
  assertEquals(postRes.headers.get("X-Method"), "POST");

  const getRes = await app.request("/test", { method: "GET" });
  assertEquals(getRes.headers.get("X-Method"), "GET");
});
