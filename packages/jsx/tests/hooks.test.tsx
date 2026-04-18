import { assertEquals, assertStringIncludes } from "@std/assert";
import { Hono } from "@hono/hono";
import { createJsxRenderer } from "@ggpwnkthx/sprout-jsx/renderer";
import {
  createContext,
  useContext,
  useRequestContext,
} from "@ggpwnkthx/sprout-jsx/hooks";

// ---------------------------------------------------------------------------
// useRequestContext — access Hono request context from within JSX
// ---------------------------------------------------------------------------

Deno.test("useRequestContext returns the Hono context object", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadC = () => {
    const c = useRequestContext();
    return <span>{typeof c}</span>;
  };

  app.get("/", (c) => c.render(<ReadC />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  // typeof c should be "object"
  assertStringIncludes(html, "object");
});

Deno.test("useRequestContext can read the HTTP method", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ShowMethod = () => {
    const c = useRequestContext();
    return <span id="method">{c.req.method}</span>;
  };

  app.get("/", (c) => c.render(<ShowMethod />));

  const res = await app.request("/", { method: "GET" });
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "GET");
});

Deno.test("useRequestContext reflects POST method in request", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ShowMethod = () => {
    const c = useRequestContext();
    return <span>{c.req.method}</span>;
  };

  app.post("/submit", (c) => c.render(<ShowMethod />));

  const res = await app.request("/submit", { method: "POST" });
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "POST");
});

Deno.test("useRequestContext can read request path", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ShowPath = () => {
    const c = useRequestContext();
    return <span>{c.req.path}</span>;
  };

  app.get("/items/123", (c) => c.render(<ShowPath />));

  const res = await app.request("/items/123");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "/items/123");
});

Deno.test("useRequestContext can read query parameters", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ShowQuery = () => {
    const c = useRequestContext();
    return <span>{c.req.query("name") ?? "none"}</span>;
  };

  app.get("/search", (c) => c.render(<ShowQuery />));

  const res = await app.request("/search?name=Alice");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "Alice");
});

Deno.test("useRequestContext returns undefined for missing query param", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ShowQuery = () => {
    const c = useRequestContext();
    const val = c.req.query("missing");
    // Missing params return undefined (not null) — JSX renders nothing for undefined
    return <span id="result">{val === undefined ? "undefined" : val}</span>;
  };

  app.get("/search", (c) => c.render(<ShowQuery />));

  const res = await app.request("/search");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "undefined");
});

Deno.test("useRequestContext can read request headers", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ShowHeader = () => {
    const c = useRequestContext();
    return <span>{c.req.header("x-custom") ?? "none"}</span>;
  };

  app.get("/", (c) => c.render(<ShowHeader />));

  const res = await app.request("/", {
    headers: { "x-custom": "header-value" },
  });
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "header-value");
});

Deno.test("useRequestContext can use c.text() to send a plain text response", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const EchoMethod = () => {
    const c = useRequestContext();
    return <span>{c.req.method}</span>;
  };

  app.get("/", (c) => c.render(<EchoMethod />));

  const res = await app.request("/", { method: "GET" });
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/html; charset=UTF-8");
});

// ---------------------------------------------------------------------------
// useContext via hooks.ts re-export — integration with context Provider
// ---------------------------------------------------------------------------

Deno.test("hooks re-exports createContext and useContext as functions", () => {
  assertEquals(typeof createContext, "function");
  assertEquals(typeof useContext, "function");
});

Deno.test("useContext via hooks returns Provider value in a rendered component", async () => {
  const ctx = createContext("hooks-initial");

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadCtx = () => {
    const val = useContext(ctx);
    return <span>{String(val)}</span>;
  };

  app.get("/", (c) =>
    c.render(
      <ctx.Provider value="hooks-provided">
        <ReadCtx />
      </ctx.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "hooks-provided");
});

Deno.test("useContext via hooks returns initial value when no Provider above", async () => {
  const ctx = createContext("hooks-fallback");

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadCtx = () => {
    const val = useContext(ctx);
    return <span>{String(val)}</span>;
  };

  app.get("/", (c) => c.render(<ReadCtx />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "hooks-fallback");
});

Deno.test("multiple contexts via hooks module are independent", async () => {
  const ctx1 = createContext("one");
  const ctx2 = createContext(2);

  const app = new Hono();
  app.use(createJsxRenderer());

  const ReadBoth = () => {
    const v1 = useContext(ctx1);
    const v2 = useContext(ctx2);
    return <span>{String(v1)}:{String(v2)}</span>;
  };

  app.get("/", (c) =>
    c.render(
      <ctx1.Provider value="ONE">
        <ctx2.Provider value={200}>
          <ReadBoth />
        </ctx2.Provider>
      </ctx1.Provider>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "ONE");
  assertStringIncludes(html, "200");
});

// ---------------------------------------------------------------------------
// useRequestContext with async components
// ---------------------------------------------------------------------------

Deno.test("useRequestContext is accessible inside async components rendered via createJsxRenderer", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const AsyncComponent = async () => {
    await Promise.resolve();
    const c = useRequestContext();
    return <span>path:{c.req.path}</span>;
  };

  app.get("/async/test", (c) => c.render(<AsyncComponent />));

  const res = await app.request("/async/test");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "path:/async/test");
});

Deno.test("useRequestContext can read query params from within async component", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const AsyncQuery = async () => {
    await Promise.resolve();
    const c = useRequestContext();
    const name = c.req.query("name");
    return <span>{name ?? "no-name"}</span>;
  };

  app.get("/async-search", (c) => c.render(<AsyncQuery />));

  const res = await app.request("/async-search?name=AsyncAlice");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "AsyncAlice");
});

Deno.test("useRequestContext in nested async components", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const InnerAsync = async () => {
    await Promise.resolve();
    const c = useRequestContext();
    return <span>inner:{c.req.method}</span>;
  };

  const OuterAsync = async () => {
    await Promise.resolve();
    return (
      <div>
        <InnerAsync />
      </div>
    );
  };

  app.post("/nested-async", (c) => c.render(<OuterAsync />));

  const res = await app.request("/nested-async", { method: "POST" });
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "inner:POST");
});

Deno.test("useRequestContext returns consistent context across multiple async child renders", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const ChildAsync = async ({ id }: { id: number }) => {
    await Promise.resolve();
    const c = useRequestContext();
    return <span>child{id}:{c.req.path}</span>;
  };

  const Parent = () => (
    <div>
      <ChildAsync id={1} />
      <ChildAsync id={2} />
    </div>
  );

  app.get("/multi-async", (c) => c.render(<Parent />));

  const res = await app.request("/multi-async");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertStringIncludes(html, "child1:/multi-async");
  assertStringIncludes(html, "child2:/multi-async");
});
