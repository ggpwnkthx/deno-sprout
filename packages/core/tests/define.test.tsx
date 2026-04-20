import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  type DataLoader,
  define,
  type Handler,
  type Handlers,
  type LayoutComponent,
  type PageComponent,
} from "@ggpwnkthx/sprout-core/lib/define";
import type { Context } from "@hono/hono";
import type { MiddlewareHandler } from "@ggpwnkthx/sprout-core/context";
import { Hono } from "@hono/hono";

Deno.test("define.page returns the same component", () => {
  const component: PageComponent = ({ data }) => <div>{data}</div>;
  const result = define.page(component);
  assertStrictEquals(result, component);
});

Deno.test("define.page wraps data in a PageComponent type", () => {
  // Verify the type narrowing is actually useful by checking the result
  // is callable as a PageComponent
  const component: PageComponent<string> = ({ data }) => <div>{data}</div>;
  const result = define.page(component);
  // Runtime check: calling it with page props works
  const rendered = result({
    data: "test",
    params: {},
    url: new URL("http://localhost/"),
  });
  assertEquals(String(rendered).includes("test"), true);
});

Deno.test("define.loader returns the same loader", () => {
  const loader: DataLoader<string> = (_c: Context) => "loaded";
  const result = define.loader(loader);
  assertStrictEquals(result, loader);
});

Deno.test("define.loader result is callable and returns data", () => {
  const loader: DataLoader<{ message: string }> = (_c: Context) => ({
    message: "hello",
  });
  const wrapped = define.loader(loader);
  // Hono's Context is the input type; result should be the loaded data
  const fakeContext = {} as Context;
  const data = wrapped(fakeContext);
  assertEquals((data as { message: string }).message, "hello");
});

Deno.test("define.handlers accepts a Handlers object as-is", () => {
  const handlers: Handlers = {
    GET: (_c) => new Response("get"),
    POST: (_c) => new Response("post"),
  };
  const result = define.handlers(handlers);
  assertStrictEquals(result, handlers);
});

Deno.test("define.handlers wraps a bare function as GET handler", () => {
  const fn: Handler = (_c) => new Response("bare");
  const result = define.handlers(fn);
  assertEquals(result.GET, fn);
  assertEquals(Object.keys(result).length, 1);
});

Deno.test("define.handlers bare function used in Hono app responds correctly", async () => {
  const app = new Hono();
  const fn: Handler = (c) => c.text("bare fn");
  const handlers = define.handlers(fn);
  // define.handlers wraps a bare fn as { GET: fn }
  app.get("/bare", handlers.GET!);
  const res = await app.request("/bare");
  assertEquals(res.status, 200);
  assertEquals(await res.text(), "bare fn");
});

Deno.test("define.layout returns the same component", () => {
  const layout: LayoutComponent = ({ children }) => (
    <section>{children}</section>
  );
  const result = define.layout(layout);
  assertStrictEquals(result, layout);
});

Deno.test("define.middleware returns the same handler", () => {
  const handler: Handler = (c) => c.text("ok");
  const result = define.middleware(handler);
  assertStrictEquals(result, handler);
});

Deno.test("define.middleware applied via Hono app sets header", async () => {
  const app = new Hono();
  // define.middleware returns the same handler; test the runtime behavior
  // by using a properly typed MiddlewareHandler
  const rawHandler: MiddlewareHandler = (c, next) => {
    c.header("X-Middleware", "works");
    return next();
  };
  const mw = define.middleware(rawHandler as unknown as Handler);
  // Apply via app.use with the MiddlewareHandler type
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.use("*", mw as unknown as Parameters<typeof app.use>[1]);
  app.get("/", (c) => c.text("ok"));
  const res = await app.request("/");
  assertEquals(res.headers.get("X-Middleware"), "works");
});
