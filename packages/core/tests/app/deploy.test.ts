import { assertEquals, assertStringIncludes } from "@std/assert";
import { Hono } from "@hono/hono";
import { createJsxRenderer } from "@ggpwnkthx/sprout-jsx/renderer";
import { fsRoutesFromManifest } from "@ggpwnkthx/sprout-router/fs";
import type {
  LayoutComponent,
  RoutesManifest,
} from "@ggpwnkthx/sprout-core/types";
import { writeRoute } from "../helpers.ts";
import { join } from "@std/path";

// ---------------------------------------------------------------------------
// app/deploy.test.ts — fsRoutesFromManifest deploy-mode init
// ---------------------------------------------------------------------------

Deno.test("fsRoutesFromManifest with valid routes.json responds correctly", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await Deno.mkdir(routesDir, { recursive: true });

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
        {
          filePath: join(routesDir, "api/data.ts"),
          pattern: "/api/data",
          isApi: true,
          skipInheritedLayouts: false,
          layoutChain: [],
          middlewareChain: [],
        },
      ],
      builtAt: new Date().toISOString(),
      version: "1.0.0",
    };

    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>home</p>"; }`,
    );
    await writeRoute(
      routesDir,
      "about.tsx",
      `export default function About() { return "<p>about us</p>"; }`,
    );
    await writeRoute(
      routesDir,
      "api/data.ts",
      `export const GET = (c) => c.json({ ok: true });`,
    );

    const app = new Hono();
    await fsRoutesFromManifest({
      app,
      manifest,
      onPage: ({ pattern }) => {
        const layout: LayoutComponent = ({ children }) => children;
        app.use(pattern, createJsxRenderer(layout));
      },
    });

    const homeRes = await app.request("/");
    assertEquals(homeRes.status, 200);
    assertStringIncludes(await homeRes.text(), "<p>home</p>");

    const aboutRes = await app.request("/about");
    assertEquals(aboutRes.status, 200);
    assertStringIncludes(await aboutRes.text(), "<p>about us</p>");

    const apiRes = await app.request("/api/data");
    assertEquals(apiRes.status, 200);
    assertEquals(await apiRes.json(), { ok: true });
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("fsRoutesFromManifest with layoutChain applies layouts in order", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });
    await Deno.mkdir(routesDir, { recursive: true });

    await writeRoute(
      routesDir,
      "_layout.tsx",
      `export default function RootLayout({ children }) { return "<div id='root'>" + children + "</div>"; }`,
    );
    const rootLayoutPath = join(routesDir, "_layout.tsx");

    const manifest: RoutesManifest = {
      routes: [
        {
          filePath: join(routesDir, "index.tsx"),
          pattern: "/",
          isApi: false,
          skipInheritedLayouts: false,
          layoutChain: [rootLayoutPath],
          middlewareChain: [],
        },
      ],
      builtAt: new Date().toISOString(),
      version: "1.0.0",
    };

    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>content</p>"; }`,
    );

    const app = new Hono();
    await fsRoutesFromManifest({
      app,
      manifest,
      onPage: ({ pattern }) => {
        const layout: LayoutComponent = ({ children }) => children;
        app.use(pattern, createJsxRenderer(layout));
      },
    });

    const res = await app.request("/");
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "<div id='root'>");
    assertStringIncludes(body, "<p>content</p>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("fsRoutesFromManifest with middlewareChain applies middleware", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });
    await Deno.mkdir(routesDir, { recursive: true });

    await writeRoute(
      routesDir,
      "_middleware.ts",
      `
      export default async function RootMiddleware(c, next) {
        c.header("X-Sprout-Deploy-Test", "applied");
        return next();
      }
    `,
    );
    const middlewarePath = join(routesDir, "_middleware.ts");

    const manifest: RoutesManifest = {
      routes: [
        {
          filePath: join(routesDir, "index.tsx"),
          pattern: "/",
          isApi: false,
          skipInheritedLayouts: false,
          layoutChain: [],
          middlewareChain: [middlewarePath],
        },
      ],
      builtAt: new Date().toISOString(),
      version: "1.0.0",
    };

    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>home</p>"; }`,
    );

    const app = new Hono();
    await fsRoutesFromManifest({
      app,
      manifest,
      onPage: ({ pattern }) => {
        const layout: LayoutComponent = ({ children }) => children;
        app.use(pattern, createJsxRenderer(layout));
      },
    });

    const res = await app.request("/");
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("X-Sprout-Deploy-Test"), "applied");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("fsRoutesFromManifest with skipInheritedLayouts skips root layout", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });
    await Deno.mkdir(routesDir, { recursive: true });

    await writeRoute(
      routesDir,
      "_layout.tsx",
      `export default function RootLayout({ children }) { return "<div id='root'>" + children + "</div>"; }`,
    );
    const rootLayoutPath = join(routesDir, "_layout.tsx");

    await writeRoute(
      routesDir,
      "skip.tsx",
      `export const config = { skipInheritedLayouts: true }; export default function Skip() { return "<p>skip content</p>"; }`,
    );

    const manifest: RoutesManifest = {
      routes: [
        {
          filePath: join(routesDir, "skip.tsx"),
          pattern: "/skip",
          isApi: false,
          skipInheritedLayouts: true,
          layoutChain: [rootLayoutPath],
          middlewareChain: [],
        },
      ],
      builtAt: new Date().toISOString(),
      version: "1.0.0",
    };

    const app = new Hono();
    await fsRoutesFromManifest({
      app,
      manifest,
      onPage: ({ pattern }) => {
        const layout: LayoutComponent = ({ children }) => children;
        app.use(pattern, createJsxRenderer(layout));
      },
    });

    const res = await app.request("/skip");
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "<p>skip content</p>");
    // With skipInheritedLayouts=true and an empty layout chain passed to onPage,
    // the page should render without any layout wrapping
    assertEquals(body.includes("<div id='root'>"), false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("fsRoutesFromManifest with missing filePath throws TypeError", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });
    await Deno.mkdir(routesDir, { recursive: true });

    const manifest: RoutesManifest = {
      routes: [
        {
          filePath: join(routesDir, "does-not-exist.tsx"),
          pattern: "/missing",
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
    // When a route file doesn't exist, fsRoutesFromManifest throws Module not found.
    let threw = false;
    try {
      await fsRoutesFromManifest({
        app,
        manifest,
        onPage: ({ pattern }) => {
          const layout: LayoutComponent = ({ children }) => children;
          app.use(pattern, createJsxRenderer(layout));
        },
      });
    } catch (e) {
      if (e instanceof TypeError && e.message.includes("Module not found")) {
        threw = true;
      } else {
        throw e;
      }
    }
    assertEquals(threw, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("fsRoutesFromManifest with malformed manifest fields handled gracefully", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });
    await Deno.mkdir(routesDir, { recursive: true });

    // Use unknown to bypass type check for intentionally malformed data
    const badManifest = {
      routes: [
        {
          filePath: join(routesDir, "index.tsx"),
          pattern: "/",
          // @ts-ignore - intentionally missing isApi and skipInheritedLayouts
          layoutChain: null,
          // @ts-ignore - intentionally wrong type
          middlewareChain: null,
        },
      ],
      builtAt: new Date().toISOString(),
      version: "1.0.0",
    };

    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>home</p>"; }`,
    );

    const app = new Hono();
    await fsRoutesFromManifest({
      app,
      manifest: badManifest as unknown as RoutesManifest,
      onPage: ({ pattern }) => {
        const layout: LayoutComponent = ({ children }) => children;
        app.use(pattern, createJsxRenderer(layout));
      },
    });

    const res = await app.request("/");
    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), "<p>home</p>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("fsRoutesFromManifest with skipInheritedLayouts false still uses layouts", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });
    await Deno.mkdir(routesDir, { recursive: true });

    await writeRoute(
      routesDir,
      "_layout.tsx",
      `export default function RootLayout({ children }) { return "<div id='root'>" + children + "</div>"; }`,
    );
    const rootLayoutPath = join(routesDir, "_layout.tsx");

    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>content</p>"; }`,
    );

    const manifest: RoutesManifest = {
      routes: [
        {
          filePath: join(routesDir, "index.tsx"),
          pattern: "/",
          isApi: false,
          skipInheritedLayouts: false,
          layoutChain: [rootLayoutPath],
          middlewareChain: [],
        },
      ],
      builtAt: new Date().toISOString(),
      version: "1.0.0",
    };

    const app = new Hono();
    await fsRoutesFromManifest({
      app,
      manifest,
      onPage: ({ pattern }) => {
        const layout: LayoutComponent = ({ children }) => children;
        app.use(pattern, createJsxRenderer(layout));
      },
    });

    const res = await app.request("/");
    const body = await res.text();
    assertStringIncludes(body, "<div id='root'>");
    assertStringIncludes(body, "<p>content</p>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
