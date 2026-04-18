import { assertEquals } from "@std/assert";
import { join } from "@std/path";
import { Hono } from "@hono/hono";
import { fsRoutes } from "./fs.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Write a file with content, creating parent directories as needed. */
async function writeFile(filePath: string, content: string): Promise<void> {
  await Deno.mkdir(join(filePath, ".."), { recursive: true });
  await Deno.writeFile(filePath, new TextEncoder().encode(content));
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
