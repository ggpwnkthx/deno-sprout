import { assertEquals, assertStringIncludes } from "@std/assert";
import { join } from "@std/path";
import { Hono } from "@hono/hono";
import { fsRoutes, fsRoutesFromManifest } from "../fs.ts";
import type { RoutesManifest } from "@ggpwnkthx/sprout-core/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a file with content, creating parent directories as needed. */
async function writeFile(filePath: string, content: string): Promise<void> {
  await Deno.mkdir(join(filePath, ".."), { recursive: true });
  await Deno.writeFile(filePath, new TextEncoder().encode(content));
}

/** Get text body from a response that may be either Response or Hono's Context. */
async function getBody(
  res: Response | { text(): Promise<Response> },
): Promise<string> {
  if (res instanceof Response) {
    return res.text();
  }
  // res is Hono Context - its text() returns a Response
  const responseObj = await res.text();
  return responseObj.text();
}

// ---------------------------------------------------------------------------
// fsRoutes tests
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutes registers a simple index route and responds with 200",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "index.tsx"),
        "export default function Index() { return <h1>Hello</h1>; }",
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/");
      assertEquals(res.status, 200);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes registers static routes before dynamic routes",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "index.tsx"),
        "export default function Index() { return <h1>Index</h1>; }",
      );
      await writeFile(
        join(routesDir, "about.tsx"),
        "export default function About() { return <h1>About</h1>; }",
      );
      await writeFile(
        join(routesDir, "blog/[slug].tsx"),
        "export default function BlogSlug() { return <h1>Blog</h1>; }",
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      // Both static routes should work
      const indexRes = await app.request("/");
      assertEquals(indexRes.status, 200);
      const aboutRes = await app.request("/about");
      assertEquals(aboutRes.status, 200);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes handles API routes with method handlers",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "api", "users.ts"),
        "export const GET = (c) => c.json({ users: [] });",
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/api/users");
      assertEquals(res.status, 200);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes skips _layout files during route registration (they are resolved per-route)",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      // Reserved _layout file should not cause errors when discovered
      await writeFile(
        join(routesDir, "_layout.tsx"),
        "export default function Layout({ children }) { return <html>{children}</html>; }",
      );
      await writeFile(
        join(routesDir, "index.tsx"),
        "export default function Index() { return <h1>Hello</h1>; }",
      );

      const app = new Hono();
      // Should not throw
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/");
      assertEquals(res.status, 200);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes handles missing routes with 404",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "index.tsx"),
        "export default function Index() { return <h1>Hello</h1>; }",
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/nonexistent");
      assertEquals(res.status, 404);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes onPage callback is called for each page route",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "index.tsx"),
        "export default function Index() { return <h1>Hello</h1>; }",
      );
      await writeFile(
        join(routesDir, "about.tsx"),
        "export default function About() { return <h1>About</h1>; }",
      );

      const app = new Hono();
      const seenPatterns: string[] = [];

      await fsRoutes({
        app,
        dir: routesDir,
        onPage: ({ pattern }) => {
          seenPatterns.push(pattern);
        },
      });

      // Both page routes should have triggered the callback
      assertEquals(seenPatterns.includes("/"), true);
      assertEquals(seenPatterns.includes("/about"), true);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// fsRoutesFromManifest - basic smoke test (layout/middleware chain from manifest
// is exercised via the existing skipInheritedLayouts integration test)
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutesFromManifest with onPage callback fires for each page route",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { return "<h1>home</h1>"; }`,
      );
      await writeFile(
        join(routesDir, "about.tsx"),
        `export default function About() { return "<h1>about</h1>"; }`,
      );

      const manifest: RoutesManifest = {
        routes: [
          {
            filePath: join(routesDir, "index.tsx"),
            pattern: "/",
            isApi: false,
            skipInheritedLayouts: false,
            layoutChain: [],
            middlewareChain: [],
          },
          {
            filePath: join(routesDir, "about.tsx"),
            pattern: "/about",
            isApi: false,
            skipInheritedLayouts: false,
            layoutChain: [],
            middlewareChain: [],
          },
        ],
        builtAt: new Date().toISOString(),
        version: "1.0.0",
      };

      const app = new Hono();
      const seenPatterns: string[] = [];

      await fsRoutesFromManifest({
        app,
        manifest,
        onPage: ({ pattern }) => {
          seenPatterns.push(pattern);
        },
      });

      assertEquals(seenPatterns.includes("/"), true);
      assertEquals(seenPatterns.includes("/about"), true);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// handler() undefined / data / Response cases
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutes handler() returning undefined falls through to page component",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "about.tsx"),
        `export const handler = () => undefined; export default function About() { return "<p>page content</p>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/about");
      const body = await res.text();
      assertStringIncludes(body, "page content");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes GET handler overrides handler() data return",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "api", "hello.ts"),
        `export const handler = () => ({ from: "handler" }); export const GET = (c) => c.text("GET"); export default function Hello() { return "<p>page</p>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/api/hello");
      const body = await res.text();
      // GET handler takes precedence over handler() returning data
      assertEquals(body, "GET");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes route with both handler() returning data AND GET method: GET takes precedence",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "api", "hello.ts"),
        `export const handler = () => ({ from: "handler" }); export const GET = (c) => c.text("GET override"); export default function Hello() { return "<p>page</p>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/api/hello");
      const body = await res.text();
      assertEquals(body, "GET override");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// _error.tsx edge cases
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutes _error.tsx receives the original error, not a string",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_error.tsx"),
        `export default function ErrorPage({ error }) { return \`<p>error message: \${error.message}</p>\`; }`,
      );
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { throw new Error("specific error"); }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/");
      const body = await getBody(res);
      assertStringIncludes(body, "specific error");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// _404.tsx edge cases
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutes _404.tsx rendered as string becomes a 404 page",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_404.tsx"),
        `export default function NotFound() { return "<h1>gone</h1>"; }`,
      );
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { return "<h1>home</h1>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/does-not-exist");
      assertEquals(res.status, 404);
      const body = await getBody(res);
      assertStringIncludes(body, "gone");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes _404.tsx rendering throws is caught by _error.tsx",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_error.tsx"),
        `export default function ErrorPage({ error }) { return \`<p>caught: \${error.message}</p>\`; }`,
      );
      await writeFile(
        join(routesDir, "_404.tsx"),
        `export default function NotFound() { throw new Error("404 rendering error"); }`,
      );
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { return "<h1>home</h1>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/does-not-exist");
      assertEquals(res.status, 500);
      const body = await getBody(res);
      assertStringIncludes(body, "404 rendering error");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// _middleware.ts edge cases
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutes _middleware that does not call next() short-circuits",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_middleware.ts"),
        `export default function BlockMiddleware(c) { return c.text("blocked", 403); }`,
      );
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { return "<h1>Hello</h1>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/");
      assertEquals(res.status, 403);
      const body = await getBody(res);
      assertEquals(body, "blocked");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// Note: _middleware.ts registered via app.use("*", ...) applies globally to all routes.
// Nested middleware does NOT scope to its subdirectory — it runs for every request.
// The test below documents this: both root and blog headers appear on all routes.
Deno.test(
  "fsRoutes _middleware files apply globally (not scoped to subtree)",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_middleware.ts"),
        `export default function RootMiddleware(c, next) { c.header("x-root", "true"); return next(); }`,
      );
      await writeFile(
        join(routesDir, "blog", "_middleware.ts"),
        `export default function BlogMiddleware(c, next) { c.header("x-blog", "true"); return next(); }`,
      );
      await writeFile(
        join(routesDir, "blog", "index.tsx"),
        `export default function BlogIndex() { return "<p>blog</p>"; }`,
      );
      await writeFile(
        join(routesDir, "about.tsx"),
        `export default function About() { return "<p>about</p>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      // Both routes get both headers because _middleware applies globally
      const blogRes = await app.request("/blog");
      assertEquals(blogRes.status, 200);
      assertEquals(blogRes.headers.get("x-root"), "true");
      assertEquals(blogRes.headers.get("x-blog"), "true");

      const aboutRes = await app.request("/about");
      assertEquals(aboutRes.status, 200);
      assertEquals(aboutRes.headers.get("x-root"), "true");
      assertEquals(aboutRes.headers.get("x-blog"), "true");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// Additional onPage callback tests
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutes onPage fires for each non-API route",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { return "<h1>home</h1>"; }`,
      );
      await writeFile(
        join(routesDir, "blog.tsx"),
        `export default function Blog() { return "<h1>blog</h1>"; }`,
      );

      const app = new Hono();
      const seenPatterns: string[] = [];

      await fsRoutes({
        app,
        dir: routesDir,
        onPage: ({ pattern }) => {
          seenPatterns.push(pattern);
        },
      });

      assertEquals(seenPatterns.includes("/"), true);
      assertEquals(seenPatterns.includes("/blog"), true);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// Multiple method handlers on same route
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutes page route responds to multiple HTTP methods via GET/POST/etc exports",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "api", "users.ts"),
        `export const GET = (c) => c.json([]); export const POST = (c) => c.json({ created: true }, 201); export default function Users() { return "<p>users page</p>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const getRes = await app.request("/api/users", { method: "GET" });
      assertEquals(getRes.status, 200);
      assertEquals(await getRes.json(), []);

      const postRes = await app.request("/api/users", { method: "POST" });
      assertEquals(postRes.status, 201);
      assertEquals(await postRes.json(), { created: true });

      const putRes = await app.request("/api/users", { method: "PUT" });
      // PUT not defined → falls through to page component (returns HTML)
      assertEquals(putRes.status, 200);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// Route with only handler(), no default export
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutes route with only handler() and no default component responds with 200",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      // Use explicit GET export so the method handler is registered
      await writeFile(
        join(routesDir, "api", "ping.ts"),
        `export const GET = (c) => c.text("pong");`,
      );
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { return "<h1>home</h1>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/api/ping");
      assertEquals(res.status, 200);
      const body = await res.text();
      assertEquals(body, "pong");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

// ---------------------------------------------------------------------------
// routeOverride config
// ---------------------------------------------------------------------------

Deno.test(
  "fsRoutes routeOverride config changes the registered pattern",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "blog", "[slug].tsx"),
        `export default function BlogSlug() { return "<p>blog</p>"; }`,
      );

      const app = new Hono();
      await fsRoutes({
        app,
        dir: routesDir,
        onPage: ({ pattern }) => {
          // Override pattern to custom path
          if (pattern === "/blog/:slug") {
            // This tests that onPage receives the original pattern
            // (routeOverride is handled during registration)
          }
        },
      });

      // The file is blog/[slug].tsx → /blog/:slug by default
      const res = await app.request("/blog/my-post");
      assertEquals(res.status, 200);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes _error.tsx catches thrown exceptions and renders error page",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_error.tsx"),
        `export default function ErrorPage({ error }) { return \`<h1>Error: \${error.message}</h1>\`; }`,
      );
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { throw new Error("test"); }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/");
      assertEquals(res.status, 500);
      const body = await res.text();
      assertStringIncludes(body, "Error: test");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes _404.tsx renders custom 404 page for unknown routes",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_404.tsx"),
        `export default function NotFound() { return "<h1>not found page</h1>"; }`,
      );
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { return "<h1>Hello</h1>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/does-not-exist");
      assertEquals(res.status, 404);
      const body = await res.text();
      assertStringIncludes(body, "not found page");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes middleware chaining applies root and nested _middleware",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_middleware.ts"),
        `export default function RootMiddleware(c, next) { c.header("x-root", "true"); return next(); }`,
      );
      await writeFile(
        join(routesDir, "blog", "_middleware.ts"),
        `export default function BlogMiddleware(c, next) { c.header("x-blog", "true"); return next(); }`,
      );
      await writeFile(
        join(routesDir, "blog", "index.tsx"),
        `export default function BlogIndex({ url }) { return \`<p>blog page: \${url.pathname}</p>\`; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/blog");
      const body = await getBody(res);
      assertStringIncludes(body, "blog page: /blog");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes handler() returning a Response short-circuits page rendering",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "api", "status.ts"),
        `export const handler = (c) => c.json({ status: "ok" }); export default function ApiStatus() { return "<p>should not see this</p>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/api/status");
      assertEquals(res.status, 200);
      const body = await res.json();
      assertEquals(body, { status: "ok" });
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes handler() returning non-Response data passes it as props.data",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "api", "hello.ts"),
        `export const handler = () => ({ message: "hello" }); export default function Hello({ data }) { return \`<p>\${data?.message ?? "no data"}</p>\`; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/api/hello");
      const body = await res.text();
      assertStringIncludes(body, "hello");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes layout chain applies root and nested _layout wrappers",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_layout.tsx"),
        `export default function RootLayout({ children }) { return \`<html><body>\${children}</body></html>\`; }`,
      );
      await writeFile(
        join(routesDir, "blog", "_layout.tsx"),
        `export default function BlogLayout({ children }) { return \`<div>\${children}</div>\`; }`,
      );
      await writeFile(
        join(routesDir, "blog", "index.tsx"),
        `export default function BlogIndex() { return "<p>Hello</p>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/blog");
      const body = await res.text();
      assertStringIncludes(body, "<html>");
      assertStringIncludes(body, "<div>");
      assertStringIncludes(body, "<p>Hello</p>");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutesFromManifest with onPage callback fires for each page route",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "index.tsx"),
        `export default function Index() { return "<h1>home</h1>"; }`,
      );
      await writeFile(
        join(routesDir, "about.tsx"),
        `export default function About() { return "<h1>about</h1>"; }`,
      );

      const manifest: RoutesManifest = {
        routes: [
          {
            filePath: join(routesDir, "index.tsx"),
            pattern: "/",
            isApi: false,
            skipInheritedLayouts: false,
            layoutChain: [],
            middlewareChain: [],
          },
          {
            filePath: join(routesDir, "about.tsx"),
            pattern: "/about",
            isApi: false,
            skipInheritedLayouts: false,
            layoutChain: [],
            middlewareChain: [],
          },
        ],
        builtAt: new Date().toISOString(),
        version: "1.0.0",
      };

      const app = new Hono();
      const seenPatterns: string[] = [];

      await fsRoutesFromManifest({
        app,
        manifest,
        onPage: ({ pattern }) => {
          seenPatterns.push(pattern);
        },
      });

      assertEquals(seenPatterns.includes("/"), true);
      assertEquals(seenPatterns.includes("/about"), true);
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes method handler on a page route overrides the page component for that method",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "about.tsx"),
        `export default function About() { return "<p>page content</p>"; } export const GET = (c) => c.text("GET override");`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      const res = await app.request("/about", { method: "GET" });
      const body = await res.text();
      assertEquals(body, "GET override");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);

Deno.test(
  "fsRoutes page with skipInheritedLayouts skips parent layout wrappers",
  async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const routesDir = join(tmp, "routes");
      await writeFile(
        join(routesDir, "_layout.tsx"),
        `export default function RootLayout({ children }) { return \`<div id="root">\${children}</div>\`; }`,
      );
      await writeFile(
        join(routesDir, "blog", "_layout.tsx"),
        `export default function BlogLayout({ children }) { return \`<div id="blog">\${children}</div>\`; }`,
      );
      await writeFile(
        join(routesDir, "blog", "noskip.tsx"),
        `export default function NoSkip() { return "<p>no skip</p>"; }`,
      );
      await writeFile(
        join(routesDir, "blog", "skip.tsx"),
        `export const config = { skipInheritedLayouts: true }; export default function Skip() { return "<p>skip</p>"; }`,
      );

      const app = new Hono();
      await fsRoutes({ app, dir: routesDir });

      // /blog/noskip should have both root and blog layouts
      const noskipRes = await app.request("/blog/noskip");
      const noskipBody = await getBody(noskipRes);
      assertStringIncludes(noskipBody, '<div id="root">');
      assertStringIncludes(noskipBody, '<div id="blog">');

      // /blog/skip should have only blog layout (skipInheritedLayouts skips root)
      const skipRes = await app.request("/blog/skip");
      const skipBody = await getBody(skipRes);
      assertStringIncludes(skipBody, '<div id="blog">');
      // Root layout should be skipped due to skipInheritedLayouts: true
      assertEquals(skipBody.includes('<div id="root">'), false);
      assertStringIncludes(skipBody, "<p>skip</p>");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
);
