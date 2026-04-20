import { assertEquals, assertStringIncludes } from "@std/assert";
import { App } from "@ggpwnkthx/sprout-core/app";
import { writeRoute } from "../../helpers.ts";
import { join } from "@std/path";

// ---------------------------------------------------------------------------
// init/routing.test.tsx — basic routes, nested [slug], route groups, catch-all
// ---------------------------------------------------------------------------

Deno.test("App.init() with real route files — responds 200", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "index.tsx",
      `
      export default function Index() { return "<h1>Home</h1>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/");
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "<h1>Home</h1>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() with nested route — responds 200", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "blog/[slug].tsx",
      `
      export default function BlogSlug({ params }) {
        return "<h1>Post: " + params.slug + "</h1>";
      }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/blog/my-post");
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "Post: my-post");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() catch-all [...path] matches any suffix", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "docs/[...path].tsx",
      `
      export default function DocsCatchall({ url }) {
        // Route matches: /docs/* matches /docs/intro and /docs/api/endpoints
        // params for wildcards are not exposed by Hono; use url.pathname instead
        return "<h1>Docs page path=" + url.pathname + "</h1>";
      }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res1 = await app.request("/docs/intro");
    assertEquals(res1.status, 200);
    assertStringIncludes(await res1.text(), "path=/docs/intro");

    const res2 = await app.request("/docs/api/endpoints");
    assertEquals(res2.status, 200);
    assertStringIncludes(await res2.text(), "path=/docs/api/endpoints");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() route groups (parentheses) are ignored in URL", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "(marketing)/index.tsx",
      `export default function MarketingIndex() { return "<h1>Marketing</h1>"; }`,
    );
    await writeRoute(
      routesDir,
      "(marketing)/about.tsx",
      `export default function About() { return "<h1>About Us</h1>"; }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res1 = await app.request("/");
    assertEquals(res1.status, 200);
    assertStringIncludes(await res1.text(), "Marketing");

    const res2 = await app.request("/about");
    assertEquals(res2.status, 200);
    assertStringIncludes(await res2.text(), "About Us");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() route group with nested dynamic segment", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "(blog)/[slug].tsx",
      `export default function BlogSlug({ params }) { return "<h1>Post: " + params.slug + "</h1>"; }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/my-post");
    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), "Post: my-post");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
