import { assertEquals, assertStringIncludes } from "@std/assert";
import { App } from "@ggpwnkthx/sprout-core/app";
import { writeRoute } from "../helpers.ts";
import { join } from "@std/path";

// ---------------------------------------------------------------------------
// app/containment.test.ts — _404.tsx, _error.tsx symlink containment
// ---------------------------------------------------------------------------

Deno.test("App.init() _404.tsx symlink pointing outside routesDir is ignored (containment)", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const outsideDir = join(tmpDir, "outside");
    await Deno.mkdir(routesDir, { recursive: true });
    await Deno.mkdir(outsideDir, { recursive: true });

    // Write a custom _404 handler OUTSIDE routesDir
    const outside404Path = join(outsideDir, "_404.tsx");
    await Deno.writeTextFile(
      outside404Path,
      `export default function NotFound({ url }) { return "<h1>Custom 404: " + url.pathname + "</h1>"; }`,
    );

    // Plant a symlink INSIDE routesDir/_404.tsx that points to the outside file.
    // This is how an attacker could bypass containment — by making _404.tsx
    // a symlink to a file outside routesDir.
    const symlinkPath = join(routesDir, "_404.tsx");
    await Deno.symlink(outside404Path, symlinkPath);

    // Write a normal index route so we have something to serve
    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>home</p>"; }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    // Request a nonexistent route — tryImport checks containment on the symlink
    // target realPath. Since the realPath of _404.tsx is outside routesDir,
    // the custom handler should NOT be invoked (returns default 404).
    const res = await app.request("/does-not-exist");
    assertEquals(res.status, 404);
    const body = await res.text();
    assertEquals(body, "404 Not Found");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() valid _404.tsx inside routesDir works normally", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await Deno.mkdir(routesDir, { recursive: true });

    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>home</p>"; }`,
    );
    await writeRoute(
      routesDir,
      "_404.tsx",
      `
      export default function NotFound({ url }) {
        return "<h1>Page not found: " + url.pathname + "</h1>";
      }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/does-not-exist");
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "Page not found: /does-not-exist");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() _error.tsx symlink pointing outside routesDir is ignored (containment)", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const outsideDir = join(tmpDir, "outside");
    await Deno.mkdir(routesDir, { recursive: true });
    await Deno.mkdir(outsideDir, { recursive: true });

    // Write a custom _error handler OUTSIDE routesDir
    const outsideErrorPath = join(outsideDir, "_error.tsx");
    await Deno.writeTextFile(
      outsideErrorPath,
      `export default function ErrorPage({ error }) { return "<h1>Error: " + error.message + "</h1>"; }`,
    );

    // Plant a symlink INSIDE routesDir/_error.tsx pointing to the outside file
    const symlinkPath = join(routesDir, "_error.tsx");
    await Deno.symlink(outsideErrorPath, symlinkPath);

    // Write a route that throws an error to trigger the error handler
    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { throw new Error("test error"); }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    // The index route throws, triggering the error handler.
    // tryImport checks containment on the symlink target realPath.
    // Since realPath of _error.tsx is outside routesDir, the custom
    // handler is NOT invoked. Hono's default error handler returns 500.
    const res = await app.request("/");
    assertEquals(res.status, 500);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
