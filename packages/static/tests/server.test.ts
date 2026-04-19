// server.test.ts - Tests for static file serving middleware
import { assertEquals } from "@std/assert";
import { dirname, join } from "@std/path";
import { Hono } from "@hono/hono";
import { sproutAssets, staticFiles } from "../server.ts";
import { deployIslandAssets } from "../deploy-assets.ts";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await Deno.makeTempDir({ prefix: "sprout-static-test-" });
  try {
    await fn(tempDir);
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
}

async function writeFile(path: string, content: string): Promise<void> {
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.writeTextFile(path, content);
}

// Starts Deno.serve on port 0 (OS-assigned) and passes the actual port to fn.
// Port 0 avoids hardcoded port conflicts when tests run concurrently.
async function withServer(
  app: Hono,
  fn: (port: number) => Promise<void>,
): Promise<void> {
  const server = Deno.serve({ port: 0 }, app.fetch);
  const port = (server.addr as Deno.NetAddr).port;
  try {
    await fn(port);
  } finally {
    await server.shutdown();
  }
}

// ---------------------------------------------------------------------------
// staticFiles
// ---------------------------------------------------------------------------

Deno.test("staticFiles: serves a file with matching prefix", async () => {
  await withTempDir(async (root) => {
    await writeFile(join(root, "hello.txt"), "Hello, world!");
    const app = new Hono();
    app.use(staticFiles({ root, prefix: "/assets" }));
    await withServer(app, async (port) => {
      const res = await fetch(`http://localhost:${port}/assets/hello.txt`);
      assertEquals(res.status, 200);
      assertEquals(
        res.headers.get("content-type"),
        "text/plain; charset=utf-8",
      );
      assertEquals(await res.text(), "Hello, world!");
    });
  });
});

Deno.test(
  "staticFiles: strips prefix before filesystem lookup",
  async () => {
    await withTempDir(async (root) => {
      await writeFile(join(root, "data.json"), '{"ok":true}');
      const app = new Hono();
      app.use(staticFiles({ root, prefix: "/static" }));
      await withServer(app, async (port) => {
        const res = await fetch(`http://localhost:${port}/static/data.json`);
        assertEquals(res.status, 200);
        assertEquals(
          res.headers.get("content-type"),
          "application/json",
        );
        assertEquals(await res.json(), { ok: true });
      });
    });
  },
);

Deno.test(
  "staticFiles: returns 404 when file does not exist",
  async () => {
    await withTempDir(async (root) => {
      const app = new Hono();
      app.use(staticFiles({ root, prefix: "/files" }));
      await withServer(app, async (port) => {
        const res = await fetch(`http://localhost:${port}/files/missing.txt`);
        assertEquals(res.status, 404);
        assertEquals(await res.text(), "404 Not Found");
      });
    });
  },
);

Deno.test(
  "staticFiles: serves root index for / prefix",
  async () => {
    await withTempDir(async (root) => {
      await writeFile(join(root, "index.html"), "<h1>Home</h1>");
      const app = new Hono();
      app.use(staticFiles({ root, prefix: "/static" }));
      await withServer(app, async (port) => {
        const res = await fetch(`http://localhost:${port}/static/`);
        assertEquals(res.status, 200);
        assertEquals(
          res.headers.get("content-type"),
          "text/html; charset=utf-8",
        );
        assertEquals(await res.text(), "<h1>Home</h1>");
      });
    });
  },
);

Deno.test("staticFiles: returns middleware function", () => {
  const mw = staticFiles();
  assertEquals(typeof mw, "function");
});

Deno.test(
  "staticFiles: rejects path traversal (../) with 404",
  async () => {
    await withTempDir(async (root) => {
      await writeFile(join(root, "safe.txt"), "safe content");
      const app = new Hono();
      app.use(staticFiles({ root, prefix: "/assets" }));
      await withServer(app, async (port) => {
        // Attempt to escape root via ../.../etc/passwd
        const res = await fetch(
          `http://localhost:${port}/assets/../../../etc/passwd`,
        );
        // Body must be consumed to avoid leak. Note: serveStatic may
        // resolve ../ and find a real file (returning 200), exposing a
        // path-traversal bug that needs fixing in server.ts.
        await res.text();
        assertEquals(res.status, 404);
      });
    });
  },
);

Deno.test(
  "staticFiles: returns 404 when root directory does not exist",
  async () => {
    const app = new Hono();
    app.use(
      staticFiles({
        root: "/tmp/this-dir-does-not-exist-12345",
        prefix: "/files",
      }),
    );
    await withServer(app, async (port) => {
      const res = await fetch(`http://localhost:${port}/files/some.txt`);
      await res.text(); // consume body
      assertEquals(res.status, 404);
    });
  },
);

// ---------------------------------------------------------------------------
// sproutAssets
// ---------------------------------------------------------------------------

Deno.test("sproutAssets: serves a file from distDir", async () => {
  await withTempDir(async (distDir) => {
    await writeFile(join(distDir, "client.js"), "console.log('loaded');");
    const app = new Hono();
    app.use(sproutAssets({ distDir }));
    await withServer(app, async (port) => {
      const res = await fetch(`http://localhost:${port}/_sprout/client.js`);
      assertEquals(res.status, 200);
      assertEquals(
        res.headers.get("content-type"),
        "text/javascript; charset=utf-8",
      );
      assertEquals(await res.text(), "console.log('loaded');");
    });
  });
});

Deno.test(
  "sproutAssets: sets no-cache for non-island files",
  async () => {
    await withTempDir(async (distDir) => {
      await writeFile(join(distDir, "hydrate.js"), "// hydrate");
      const app = new Hono();
      app.use(sproutAssets({ distDir }));
      await withServer(app, async (port) => {
        const res = await fetch(`http://localhost:${port}/_sprout/hydrate.js`);
        assertEquals(res.status, 200);
        assertEquals(
          res.headers.get("content-type"),
          "text/javascript; charset=utf-8",
        );
        assertEquals(res.headers.get("Cache-Control"), "no-cache");
        await res.text(); // consume body
      });
    });
  },
);

Deno.test(
  "sproutAssets: sets immutable cache for island bundles",
  async () => {
    await withTempDir(async (distDir) => {
      await writeFile(
        join(distDir, "islands/Counter.js"),
        "export default Counter;",
      );
      const app = new Hono();
      app.use(sproutAssets({ distDir }));
      await withServer(app, async (port) => {
        const res = await fetch(
          `http://localhost:${port}/_sprout/islands/Counter.js`,
        );
        assertEquals(res.status, 200);
        assertEquals(
          res.headers.get("content-type"),
          "text/javascript; charset=utf-8",
        );
        assertEquals(
          res.headers.get("Cache-Control"),
          "public, max-age=31536000, immutable",
        );
        await res.text(); // consume body
      });
    });
  },
);

Deno.test(
  "sproutAssets: strips /_sprout prefix from path",
  async () => {
    await withTempDir(async (distDir) => {
      await writeFile(
        join(distDir, "islands/Modal.js"),
        "export default Modal;",
      );
      const app = new Hono();
      app.use(sproutAssets({ distDir }));
      await withServer(app, async (port) => {
        const res = await fetch(
          `http://localhost:${port}/_sprout/islands/Modal.js`,
        );
        assertEquals(res.status, 200);
        assertEquals(
          res.headers.get("content-type"),
          "text/javascript; charset=utf-8",
        );
        assertEquals(await res.text(), "export default Modal;");
      });
    });
  },
);

Deno.test(
  "sproutAssets: returns 404 when file does not exist",
  async () => {
    await withTempDir(async (distDir) => {
      const app = new Hono();
      app.use(sproutAssets({ distDir }));
      await withServer(app, async (port) => {
        const res = await fetch(
          `http://localhost:${port}/_sprout/nonexistent.js`,
        );
        assertEquals(res.status, 404);
        assertEquals(await res.text(), "404 Not Found");
      });
    });
  },
);

Deno.test("sproutAssets: returns middleware function", () => {
  const mw = sproutAssets();
  assertEquals(typeof mw, "function");
});

Deno.test(
  "sproutAssets: rejects path traversal (../) with 404",
  async () => {
    // Note: browsers and fetch() normalize URL paths before sending HTTP
    // requests (e.g. /islands/../../client.js → /client.js), so the raw
    // path with .. cannot be tested via fetch(). Test the guard directly
    // using a mock context (same pattern as deployIslandAssets tests).
    const mw = sproutAssets({ distDir: "/tmp/nonexistent" });
    const mockCtx = {
      req: {
        path: "/_sprout/islands/../../client.js",
        url: "http://localhost/_sprout/islands/../../client.js",
      },
      text(body: string, status = 200) {
        return new Response(body, { status });
      },
    };
    const result = await mw(mockCtx as never, () => Promise.resolve());
    assertEquals((result as Response).status, 404);
  },
);

Deno.test(
  "sproutAssets: returns 404 when distDir does not exist",
  async () => {
    const app = new Hono();
    app.use(sproutAssets({ distDir: "/tmp/this-dir-does-not-exist-12345" }));
    await withServer(app, async (port) => {
      const res = await fetch(`http://localhost:${port}/_sprout/client.js`);
      await res.text(); // consume body
      assertEquals(res.status, 404);
    });
  },
);

Deno.test(
  "sproutAssets: Cache-Control header matches our value, not serveStatic's",
  async () => {
    await withTempDir(async (distDir) => {
      await writeFile(join(distDir, "hydrate.js"), "// hydrate");
      const app = new Hono();
      app.use(sproutAssets({ distDir }));
      await withServer(app, async (port) => {
        const res = await fetch(`http://localhost:${port}/_sprout/hydrate.js`);
        assertEquals(res.status, 200);
        // Verify Cache-Control is exactly "no-cache" — our re-wrap replaces
        // whatever serveStatic set, it does not append.
        assertEquals(res.headers.get("Cache-Control"), "no-cache");
        await res.text();
      });
    });
  },
);

// ---------------------------------------------------------------------------
// deployIslandAssets
// ---------------------------------------------------------------------------

Deno.test(
  "deployIslandAssets: redirects hydrate.js to manifest URL",
  async () => {
    const ctx = {
      req: {
        path: "/_sprout/hydrate.js",
        url: "http://localhost/_sprout/hydrate.js",
      },
      res: { headers: new Headers(), status: 200 },
      redirect(url: string, status = 302) {
        this.res.status = status;
        this.res.headers.set("Location", url);
        return this;
      },
      nextCalled: false,
    };
    const mw = deployIslandAssets({
      islandManifest: { hydrate: "/_sprout/hydrate.a1b2c3d4.js" },
    });
    await mw(ctx as never, () => {
      ctx.nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(ctx.res.status, 302);
    assertEquals(
      ctx.res.headers.get("Location"),
      "/_sprout/hydrate.a1b2c3d4.js",
    );
  },
);

Deno.test(
  "deployIslandAssets: prepends cdnBase to hydrate URL when provided",
  async () => {
    const ctx = {
      req: {
        path: "/_sprout/hydrate.js",
        url: "http://localhost/_sprout/hydrate.js",
      },
      res: { headers: new Headers(), status: 200 },
      redirect(url: string, status = 302) {
        this.res.status = status;
        this.res.headers.set("Location", url);
        return this;
      },
      nextCalled: false,
    };
    const mw = deployIslandAssets({
      islandManifest: { hydrate: "/_sprout/hydrate.a1b2c3d4.js" },
      cdnBase: "https://cdn.example.com",
    });
    await mw(ctx as never, () => {
      ctx.nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(ctx.res.status, 302);
    assertEquals(
      ctx.res.headers.get("Location"),
      "https://cdn.example.com/_sprout/hydrate.a1b2c3d4.js",
    );
  },
);

Deno.test(
  "deployIslandAssets: redirects island bundle to manifest URL",
  async () => {
    const ctx = {
      req: {
        path: "/_sprout/islands/Counter.js",
        url: "http://localhost/_sprout/islands/Counter.js",
      },
      res: { headers: new Headers(), status: 200 },
      redirect(url: string, status = 302) {
        this.res.status = status;
        this.res.headers.set("Location", url);
        return this;
      },
      nextCalled: false,
    };
    const mw = deployIslandAssets({
      islandManifest: {
        Counter: "/_sprout/islands/Counter.a1b2c3d4.js",
      },
    });
    await mw(ctx as never, () => {
      ctx.nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(ctx.res.status, 302);
    assertEquals(
      ctx.res.headers.get("Location"),
      "/_sprout/islands/Counter.a1b2c3d4.js",
    );
  },
);

Deno.test(
  "deployIslandAssets: prepends cdnBase to island bundle URL when provided",
  async () => {
    const ctx = {
      req: {
        path: "/_sprout/islands/Modal.js",
        url: "http://localhost/_sprout/islands/Modal.js",
      },
      res: { headers: new Headers(), status: 200 },
      redirect(url: string, status = 302) {
        this.res.status = status;
        this.res.headers.set("Location", url);
        return this;
      },
      nextCalled: false,
    };
    const mw = deployIslandAssets({
      islandManifest: { Modal: "/_sprout/islands/Modal.js" },
      cdnBase: "https://cdn.example.com",
    });
    await mw(ctx as never, () => {
      ctx.nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(ctx.res.status, 302);
    assertEquals(
      ctx.res.headers.get("Location"),
      "https://cdn.example.com/_sprout/islands/Modal.js",
    );
  },
);

Deno.test(
  "deployIslandAssets: calls next when island not in manifest",
  async () => {
    const ctx = {
      req: {
        path: "/_sprout/islands/Unknown.js",
        url: "http://localhost/_sprout/islands/Unknown.js",
      },
      res: { headers: new Headers(), status: 200 },
      redirect(_url: string, _status = 302) {
        return this;
      },
      nextCalled: false,
    };
    const mw = deployIslandAssets({
      islandManifest: { Counter: "/_sprout/islands/Counter.js" },
    });
    await mw(ctx as never, () => {
      ctx.nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(ctx.nextCalled, true);
    assertEquals(ctx.res.status, 200); // default, not redirected
  },
);

Deno.test(
  "deployIslandAssets: calls next for non-/_sprout/* paths",
  async () => {
    const ctx = {
      req: {
        path: "/other/path.js",
        url: "http://localhost/other/path.js",
      },
      res: { headers: new Headers(), status: 200 },
      redirect(_url: string, _status = 302) {
        return this;
      },
      nextCalled: false,
    };
    const mw = deployIslandAssets({
      islandManifest: { Counter: "/_sprout/islands/Counter.js" },
    });
    await mw(ctx as never, () => {
      ctx.nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(ctx.nextCalled, true);
  },
);

Deno.test(
  "deployIslandAssets: falls back to own path when hydrate key missing",
  async () => {
    const ctx = {
      req: {
        path: "/_sprout/hydrate.js",
        url: "http://localhost/_sprout/hydrate.js",
      },
      res: { headers: new Headers(), status: 200 },
      redirect(url: string, status = 302) {
        this.res.status = status;
        this.res.headers.set("Location", url);
        return this;
      },
      nextCalled: false,
    };
    const mw = deployIslandAssets({ islandManifest: {} });
    await mw(ctx as never, () => {
      ctx.nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(ctx.res.status, 302);
    assertEquals(ctx.res.headers.get("Location"), "/_sprout/hydrate.js");
  },
);

Deno.test(
  "deployIslandAssets: cdnBase with trailing slash produces no double-slash",
  async () => {
    const ctx = {
      req: {
        path: "/_sprout/hydrate.js",
        url: "http://localhost/_sprout/hydrate.js",
      },
      res: { headers: new Headers(), status: 200 },
      redirect(url: string, status = 302) {
        this.res.status = status;
        this.res.headers.set("Location", url);
        return this;
      },
      nextCalled: false,
    };
    const mw = deployIslandAssets({
      islandManifest: { hydrate: "/_sprout/hydrate.a1b2c3d4.js" },
      cdnBase: "https://cdn.example.com/", // trailing slash
    });
    await mw(ctx as never, () => {
      ctx.nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(ctx.res.status, 302);
    // Must not be https://cdn.example.com//_sprout/... (double slash)
    assertEquals(
      ctx.res.headers.get("Location"),
      "https://cdn.example.com/_sprout/hydrate.a1b2c3d4.js",
    );
  },
);

Deno.test(
  "deployIslandAssets: absolute URL in manifest is used as-is without cdnBase",
  async () => {
    const ctx = {
      req: {
        path: "/_sprout/hydrate.js",
        url: "http://localhost/_sprout/hydrate.js",
      },
      res: { headers: new Headers(), status: 200 },
      redirect(url: string, status = 302) {
        this.res.status = status;
        this.res.headers.set("Location", url);
        return this;
      },
      nextCalled: false,
    };
    const mw = deployIslandAssets({
      islandManifest: {
        hydrate: "https://cdn.example.com/_sprout/hydrate.js",
      },
      // no cdnBase
    });
    await mw(ctx as never, () => {
      ctx.nextCalled = true;
      return Promise.resolve();
    });
    assertEquals(ctx.res.status, 302);
    assertEquals(
      ctx.res.headers.get("Location"),
      "https://cdn.example.com/_sprout/hydrate.js",
    );
  },
);
