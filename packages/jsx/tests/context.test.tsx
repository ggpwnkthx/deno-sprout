import { assertEquals, assertStringIncludes } from "@std/assert";
import { createContext, useContext } from "@ggpwnkthx/sprout-jsx/hooks";
import { Hono } from "@hono/hono";
import { createJsxRenderer } from "@ggpwnkthx/sprout-jsx/renderer";

// ---------------------------------------------------------------------------
// Unit tests for createContext + useContext (direct, no renderer)
// ---------------------------------------------------------------------------

Deno.test("createContext returns a callable function with a Provider property", () => {
  const ctx = createContext("initial");
  // Hono contexts are callable functions with a .Provider property
  assertEquals(typeof ctx, "function");
  assertEquals(
    typeof (ctx as unknown as { Provider: unknown }).Provider,
    "function",
  );
});

Deno.test("createContext accepts an initial value of any type", () => {
  const ctx1 = createContext(42);
  const ctx2 = createContext("string");
  const ctx3 = createContext({ key: "value" });
  const ctx4 = createContext(null);
  const ctx5 = createContext<number[]>([1, 2, 3]);

  // Each context should be distinct
  assertEquals(ctx1, ctx1);
  assertEquals(ctx2, ctx2);
  assertEquals(ctx3, ctx3);
  assertEquals(ctx4, ctx4);
  assertEquals(ctx5, ctx5);
});

// ---------------------------------------------------------------------------
// Integration tests for context propagation via Hono JSX renderer
// ---------------------------------------------------------------------------

Deno.test("useContext returns initial value when no Provider is above in the tree", async () => {
  const ctx = createContext("fallback");

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadCtx = () => {
    const value = useContext(ctx);
    return <span id="value">{String(value)}</span>;
  };

  app.get("/", (c) => c.render(<ReadCtx />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("fallback"), true);
});

Deno.test("useContext returns the Provider value when Provider wraps the component", async () => {
  const ctx = createContext("initial");

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadCtx = () => {
    const value = useContext(ctx);
    return <span id="value">{String(value)}</span>;
  };

  // Component tree: Provider(value="provided") > ReadCtx
  app.get("/", (c) =>
    c.render(
      <ctx.Provider value="provided">
        <ReadCtx />
      </ctx.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("provided"), true);
});

Deno.test("useContext with object value propagates correctly", async () => {
  interface Theme {
    color: string;
    bg: string;
  }
  const ctx = createContext<Theme>({ color: "black", bg: "white" });

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadCtx = () => {
    const theme = useContext(ctx);
    return (
      <div style={`color:${theme.color};background:${theme.bg}`}>Themed</div>
    );
  };

  app.get("/", (c) =>
    c.render(
      <ctx.Provider value={{ color: "blue", bg: "lightblue" }}>
        <ReadCtx />
      </ctx.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("blue"), true);
  assertEquals(html.includes("lightblue"), true);
});

Deno.test("nested Providers with same context use innermost value", async () => {
  const ctx = createContext("outermost");

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadCtx = () => {
    const value = useContext(ctx);
    return <span>{String(value)}</span>;
  };

  app.get("/", (c) =>
    c.render(
      <ctx.Provider value="outer">
        <ReadCtx />
        <ctx.Provider value="inner">
          <ReadCtx />
        </ctx.Provider>
        <ReadCtx />
      </ctx.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  // Should see: outer, inner, outer
  assertStringIncludes(html, "outer");
  assertStringIncludes(html, "inner");
});

Deno.test("useContext with number value", async () => {
  const ctx = createContext(0);

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadCtx = () => {
    const n = useContext(ctx);
    return <span>{n}</span>;
  };

  app.get("/", (c) =>
    c.render(
      <ctx.Provider value={42}>
        <ReadCtx />
      </ctx.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("42"), true);
});

Deno.test("useContext with null value", async () => {
  const ctx = createContext<string | null>(null);

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadCtx = () => {
    const value = useContext(ctx);
    return <span>{value === null ? "null" : value}</span>;
  };

  app.get("/", (c) =>
    c.render(
      <ctx.Provider value="not null">
        <ReadCtx />
      </ctx.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("not null"), true);
});

Deno.test("different contexts are independent", async () => {
  const ctxA = createContext("a");
  const ctxB = createContext("b");

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadBoth = () => {
    const a = useContext(ctxA);
    const b = useContext(ctxB);
    return <span>{a}-{b}</span>;
  };

  app.get("/", (c) =>
    c.render(
      <ctxA.Provider value="A">
        <ctxB.Provider value="B">
          <ReadBoth />
        </ctxB.Provider>
      </ctxA.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "A");
  assertStringIncludes(html, "B");
});
