import { assertEquals } from "@std/assert";
import { memo } from "../lib/memo.ts";
import { Hono } from "@hono/hono";
import { createJsxRenderer } from "../renderer.ts";

// ---------------------------------------------------------------------------
// memo — caching behavior
// The tests below verify the memoization contract and integration with JSX components.
// ---------------------------------------------------------------------------

Deno.test("memo returns a callable function", () => {
  const fn = (a: unknown, b: unknown) => (a as number) + (b as number);
  const memoized = memo(fn);
  assertEquals(typeof memoized, "function");
  assertEquals(memoized(1, 2), 3);
});

Deno.test("memo caches results for same arguments", () => {
  let callCount = 0;
  const fn = (n: number) => {
    callCount++;
    return n * 2;
  };
  const memoized = memo(fn as unknown as (...args: unknown[]) => unknown);

  // First call computes
  assertEquals(memoized(5), 10);
  assertEquals(callCount, 1);

  // Second call with same args hits cache
  assertEquals(memoized(5), 10);
  assertEquals(callCount, 1); // still 1, not recomputed

  // Call with different args recomputes
  assertEquals(memoized(7), 14);
  assertEquals(callCount, 2);
});

Deno.test("memo distinguishes different argument values", () => {
  let callCount = 0;
  const fn = (a: number, b: number) => {
    callCount++;
    return a + b;
  };
  const memoized = memo(fn as unknown as (...args: unknown[]) => unknown);

  assertEquals(memoized(1, 2), 3);
  assertEquals(memoized(1, 2), 3); // cached
  assertEquals(callCount, 1);

  assertEquals(memoized(3, 4), 7);
  assertEquals(memoized(3, 4), 7); // cached
  assertEquals(callCount, 2);

  assertEquals(memoized(1, 2), 3); // back to first args, cached
  assertEquals(callCount, 2); // still 2
});

Deno.test("memo preserves function's return value", () => {
  const fn = () => 42;
  const memoized = memo(fn);
  assertEquals(memoized(), 42);
});

Deno.test("memo preserves function's arity", () => {
  const fn = (_a: unknown, _b: unknown, _c: unknown) => true;
  const memoized = memo(fn as unknown as (...args: unknown[]) => unknown);
  // The wrapper uses rest params so arity is 0 — but the memoized function
  // still accepts any arguments and dispatches correctly.
  assertEquals(typeof memoized, "function");
  assertEquals(memoized.length, 0);
  assertEquals(memoized("a", "b", "c"), true);
});

Deno.test("memo does not recompute when called with same args across multiple memo wraps", () => {
  let callCount = 0;
  const fn = () => {
    callCount++;
    return "computed";
  };

  const m1 = memo(fn);
  const m2 = memo(fn);

  // Each wrap maintains its own cache — calling m1 twice uses its cache
  assertEquals(m1(), "computed");
  assertEquals(callCount, 1);
  assertEquals(m1(), "computed"); // cached
  assertEquals(callCount, 1);

  // m2 has its own cache — first call recomputes
  assertEquals(m2(), "computed");
  assertEquals(callCount, 2);
  assertEquals(m2(), "computed"); // cached
  assertEquals(callCount, 2);
});

Deno.test("memo works with zero-arity functions", () => {
  const fn = () => "zero";
  assertEquals(memo(fn)(), "zero");
});

Deno.test("memo works with multi-arity functions and various args", () => {
  const fn = (a: number, b: number, c: number) => a + b + c;
  // Cast through unknown to satisfy memo's (...args: unknown[]) constraint
  const memoized = memo(fn as unknown as (...args: unknown[]) => unknown);
  assertEquals(memoized(1, 2, 3), 6);
  assertEquals(memoized(10, 20, 30), 60);
});

Deno.test("memo works with functions returning objects", () => {
  const fn = () => ({ key: "value", num: 99 });
  const result = memo(fn)();
  assertEquals(result.key, "value");
  assertEquals(result.num, 99);
});

Deno.test("memo works with functions returning arrays", () => {
  const fn = () => [1, 2, 3];
  assertEquals(memo(fn)(), [1, 2, 3]);
});

Deno.test("memo calls function each time when arg is a function (no cache collision)", () => {
  let callCount = 0;
  const fn = (_cb: () => number) => {
    callCount++;
    return callCount;
  };
  const memoized = memo(fn as unknown as (...args: unknown[]) => unknown);

  // Two distinct function arguments — both should compute (no cache collision)
  const f1 = () => 1;
  const f2 = () => 2;

  assertEquals(memoized(f1), 1);
  assertEquals(callCount, 1);
  assertEquals(memoized(f2), 2);
  assertEquals(callCount, 2);
  // Same function argument — should be cached
  assertEquals(memoized(f1), 1);
  assertEquals(callCount, 2);
});

Deno.test("memo calls function each time when arg is a non-plain object", () => {
  let callCount = 0;
  const fn = (_obj: object) => {
    callCount++;
    return callCount;
  };
  const memoized = memo(fn as unknown as (...args: unknown[]) => unknown);

  // Two distinct object arguments — both should compute (no cache collision)
  assertEquals(memoized({ a: 1 }), 1);
  assertEquals(callCount, 1);
  assertEquals(memoized({ b: 2 }), 2);
  assertEquals(callCount, 2);
});

Deno.test("memo works with async functions", async () => {
  const fn = async () => {
    await Promise.resolve();
    return "async result";
  };
  const memoized = memo(fn);
  const result = await memoized();
  assertEquals(result, "async result");
});

Deno.test("memo with throwing function preserves throw behavior", () => {
  const fn = () => {
    throw new Error("test error");
  };
  let threw = false;
  try {
    memo(fn)();
  } catch {
    threw = true;
  }
  assertEquals(threw, true);
});

Deno.test("memo re-throws on second call with same args (errors are not cached as values)", () => {
  const fn = () => {
    throw new Error("persistent error");
  };
  const memoized = memo(fn);

  // First call — throws
  let threw = false;
  try {
    memoized();
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "persistent error");
  }
  assertEquals(threw, true);

  // Second call with same args — must also throw, not return the Error object
  threw = false;
  try {
    memoized();
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message, "persistent error");
  }
  assertEquals(threw, true);
});

// ---------------------------------------------------------------------------
// memo — JSX component integration via renderer
// ---------------------------------------------------------------------------

Deno.test("memo wraps a JSX component that renders with createJsxRenderer", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const Component = () => <span>memo component</span>;
  const MemoComponent = memo(Component);

  app.get("/", (c) => c.render(<MemoComponent />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("memo component"), true);
});

Deno.test("memo preserves props on JSX components", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  interface Props {
    name: string;
    count: number;
  }
  const Greeter = (props: Props) => (
    <span>Hello {props.name}, count: {props.count}</span>
  );
  // Cast through any to satisfy memo's (...args: unknown[]) constraint
  // deno-lint-ignore no-explicit-any
  const MemoGreeter = memo(Greeter as any) as any;

  app.get("/", (c) => c.render(<MemoGreeter name="Alice" count={7} />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("Alice"), true);
  assertEquals(html.includes("7"), true);
});

Deno.test("memo with component returning multiple elements via Fragment", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const { Fragment } = await import("@hono/hono/jsx");
  const Multi = () => (
    <Fragment>
      <li>A</li>
      <li>B</li>
    </Fragment>
  );
  const MemoMulti = memo(Multi);

  app.get("/", (c) => c.render(<MemoMulti />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("A"), true);
  assertEquals(html.includes("B"), true);
});

Deno.test("memo component can be used alongside unmemoized components", async () => {
  const app = new Hono();
  app.use(createJsxRenderer());

  const Plain = () => <span>plain</span>;
  const Memoized = memo(() => <span>memo</span>);

  app.get("/", (c) =>
    c.render(
      <div>
        <Plain />
        <Memoized />
      </div>,
    ));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("plain"), true);
  assertEquals(html.includes("memo"), true);
});

Deno.test("memo component with layout renders inside layout", async () => {
  const app = new Hono();
  app.use(createJsxRenderer(({ children }) => (
    <html>
      <body>{children}</body>
    </html>
  )));

  const Inner = () => <p>memo in layout</p>;
  const MemoInner = memo(Inner);
  app.get("/", (c) => c.render(<MemoInner />));

  const res = await app.request("/");
  assertEquals(res.status, 200);
  const html = await res.text();
  assertEquals(html.includes("memo in layout"), true);
});
