// _shared/context.ts - Shared mock context factories for @ggpwnkthx/sprout-dev tests
// These factories produce mock Hono contexts used across multiple test files.
// All context objects use `as any` internally for the mock methods — callers should
// pass them to middleware/hmrInjector which accept MiddlewareHandler (typed externally).

/**
 * Mock Hono context for devIslandBundler middleware tests.
 * Provides text() and json() that capture their arguments for assertion.
 */
export interface BundlerMockContext {
  req: { path: string; method?: string };
  text: (body: string, status?: number) => BundlerMockContext;
  json: (data: unknown, status?: number) => BundlerMockContext;
  res: Response;
}

export interface BundlerMockResult {
  ctx: BundlerMockContext;
  /** Last body argument passed to text() or json(). */
  body: () => string;
  /** Last status argument passed to text() or json(). */
  status: () => number;
}

/**
 * Build a mock Hono context for the bundler middleware.
 * Usage:
 *   const { ctx, body, status } = createBundlerContext("/path");
 *   await middleware(ctx as any, () => Promise.resolve());
 *   assertEquals(status(), 404);
 *   assertStringIncludes(body(), "not found");
 */
export function createBundlerContext(
  path: string,
  initialRes: Response = new Response("", { status: 200 }),
): BundlerMockResult {
  let _body = "";
  let _status = 0;
  const ctx = {
    req: { path, method: "GET" },
    text(body: string, s = 200): unknown {
      _body = body;
      _status = s;
      return ctx;
    },
    json(data: unknown, s = 200): unknown {
      _body = JSON.stringify(data);
      _status = s;
      return ctx;
    },
    res: initialRes,
  } as BundlerMockContext;
  return { ctx, body: () => _body, status: () => _status };
}

/**
 * Mock Hono context for hmrInjector tests.
 * Provides text() that returns a new Response (mimicking Hono's fluent API).
 */
export function createInjectorContext(response: Response): {
  req: { path: string };
  res: Response;
  text: (
    body: string,
    status?: number,
    headers?: Record<string, string>,
  ) => Response;
} {
  return {
    req: { path: "/" },
    res: response,
    text(body: string, status = 200, headers?: Record<string, string>) {
      const h = new Headers();
      if (headers) {
        for (const [k, v] of Object.entries(headers)) h.set(k, v);
      }
      return new Response(body, { status, headers: h });
    },
  };
}
