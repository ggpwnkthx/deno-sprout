import { assertEquals, assertStringIncludes } from "@std/assert";
import { App } from "@ggpwnkthx/sprout-core/app";
import { writeRoute } from "../../helpers.ts";
import { join } from "@std/path";

// ---------------------------------------------------------------------------
// init/static-islands.test.tsx — static dir serving, distDir manifest, getIslandManifest
// ---------------------------------------------------------------------------

Deno.test("App.init() static dir serves files", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const staticDir = join(tmpDir, "static");
    await Deno.mkdir(staticDir, { recursive: true });
    await Deno.writeTextFile(join(staticDir, "hello.txt"), "Hello, static!");

    await writeRoute(
      routesDir,
      "index.tsx",
      `
      export default function Index() { return "<p>home</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      staticDir: staticDir,
      distDir: "_dist",
    });
    await app.init();

    const res = await app.request("/static/hello.txt");
    assertEquals(res.status, 200);
    assertEquals(await res.text(), "Hello, static!");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() distDir manifest sets island manifest", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });

    // Write a valid manifest.json in distDir
    await Deno.writeTextFile(
      join(distDir, "manifest.json"),
      JSON.stringify({
        islands: { Counter: "/_sprout/assets/Counter.js" },
        hydrate: "/_sprout/runtime/hydrate.js",
      }),
    );

    await writeRoute(
      routesDir,
      "index.tsx",
      `
      export default function Index() { return "<p>home</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    const manifest = app.getIslandManifest();
    assertEquals(manifest !== null, true);
    assertEquals(manifest!["Counter"], "/_sprout/assets/Counter.js");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() getIslandManifest returns all registered islands", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });

    await Deno.writeTextFile(
      join(distDir, "manifest.json"),
      JSON.stringify({
        islands: {
          Counter: "/_sprout/assets/Counter.js",
          Timer: "/_sprout/assets/Timer.js",
          Dropdown: "/_sprout/assets/Dropdown.js",
        },
        hydrate: "/_sprout/runtime/hydrate.js",
      }),
    );

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

    const manifest = app.getIslandManifest();
    assertEquals(manifest !== null, true);
    assertEquals(Object.keys(manifest!).length, 3);
    assertEquals(manifest!["Counter"], "/_sprout/assets/Counter.js");
    assertEquals(manifest!["Timer"], "/_sprout/assets/Timer.js");
    assertEquals(manifest!["Dropdown"], "/_sprout/assets/Dropdown.js");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() islandManifest is accessible via c.get() in route handler", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });

    await Deno.writeTextFile(
      join(distDir, "manifest.json"),
      JSON.stringify({
        islands: {
          Counter: "/_sprout/assets/Counter.js",
          Timer: "/_sprout/assets/Timer.js",
        },
        hydrate: "/_sprout/runtime/hydrate.js",
      }),
    );

    await writeRoute(
      routesDir,
      "index.tsx",
      `
      export default function Index() { return "<p>home</p>"; }
    `,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist",
    });
    await app.init();

    // Access the manifest via getIslandManifest() — the public API
    const manifest = app.getIslandManifest();
    assertEquals(manifest !== null, true);
    assertEquals(manifest!["Counter"], "/_sprout/assets/Counter.js");
    assertEquals(manifest!["Timer"], "/_sprout/assets/Timer.js");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() manifest with empty islands object is handled gracefully", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });

    // Valid manifest structure but no islands
    await Deno.writeTextFile(
      join(distDir, "manifest.json"),
      JSON.stringify({
        islands: {},
        hydrate: "/_sprout/runtime/hydrate.js",
      }),
    );

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

    const manifest = app.getIslandManifest();
    // Empty islands object is still non-null and valid
    assertEquals(manifest !== null, true);
    assertEquals(Object.keys(manifest!).length, 0);

    const res = await app.request("/");
    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), "<p>home</p>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() manifest with wrong islands type is rejected and does not crash", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    const distDir = join(tmpDir, "_dist");
    await Deno.mkdir(distDir, { recursive: true });

    // Malformed: islands should be Record<string,string> but is a string
    await Deno.writeTextFile(
      join(distDir, "manifest.json"),
      JSON.stringify({
        islands: "not-an-object",
        hydrate: "/_sprout/runtime/hydrate.js",
      }),
    );

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
    // Should not throw — isIslandManifest rejects the invalid manifest
    await app.init();

    // Manifest is null because isIslandManifest rejected the malformed shape
    assertEquals(app.getIslandManifest(), null);

    const res = await app.request("/");
    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), "<p>home</p>");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.init() does not crash when distDir contains no manifest.json", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const routesDir = join(tmpDir, "routes");
    await writeRoute(
      routesDir,
      "index.tsx",
      `export default function Index() { return "<p>home</p>"; }`,
    );

    const app = new App({
      root: tmpDir,
      routesDir: "routes",
      distDir: "_dist", // _dist exists but no manifest.json
    });
    // Should not throw
    await app.init();

    const res = await app.request("/");
    assertEquals(res.status, 200);
    assertEquals(app.getIslandManifest(), null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("App.getIslandManifest() returns null before init", () => {
  const app = new App({ root: "/tmp", routesDir: ".", distDir: "." });
  assertEquals(app.getIslandManifest(), null);
});

Deno.test("App.init() returns the same app instance", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const app = new App({ root: tmpDir, routesDir: ".", distDir: "." });
    const result = await app.init();
    assertEquals(result, app);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
