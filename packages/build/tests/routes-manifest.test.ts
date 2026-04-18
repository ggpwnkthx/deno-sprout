// routes-manifest_test.ts - Tests for routes manifest generation and loading
import { assertEquals } from "@std/assert";
import {
  generateRoutesManifest,
  loadRoutesManifest,
} from "../lib/routes-manifest.ts";
import type { RouteManifestEntry } from "@ggpwnkthx/sprout-core/types";
import { join } from "@std/path";

Deno.test("generateRoutesManifest - returns correct structure", () => {
  const routes: RouteManifestEntry[] = [
    {
      pattern: "/",
      filePath: "./routes/index.tsx",
      isApi: false,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
    {
      pattern: "/about",
      filePath: "./routes/about.tsx",
      isApi: false,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
    {
      pattern: "/api/items",
      filePath: "./routes/api/items.ts",
      isApi: true,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
  ];

  const manifest = generateRoutesManifest(
    routes,
    "2024-01-01T00:00:00Z",
    "1.0.0",
  );

  assertEquals(manifest.routes, routes);
  assertEquals(manifest.builtAt, "2024-01-01T00:00:00Z");
  assertEquals(manifest.version, "1.0.0");
});

Deno.test("generateRoutesManifest - handles empty routes array", () => {
  const manifest = generateRoutesManifest([], "2024-01-01T00:00:00Z", "1.0.0");

  assertEquals(manifest.routes.length, 0);
  assertEquals(manifest.builtAt, "2024-01-01T00:00:00Z");
  assertEquals(manifest.version, "1.0.0");
});

Deno.test("generateRoutesManifest - handles complex route patterns", () => {
  const routes: RouteManifestEntry[] = [
    {
      pattern: "/",
      filePath: "./routes/index.tsx",
      isApi: false,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
    {
      pattern: "/products/:id",
      filePath: "./routes/products/[id].tsx",
      isApi: false,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
    {
      pattern: "/users/:userId/posts/:postId",
      filePath: "./routes/users/[userId]/posts/[postId].tsx",
      isApi: false,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
  ];

  const manifest = generateRoutesManifest(
    routes,
    "2024-01-01T00:00:00Z",
    "2.0.0",
  );

  assertEquals(manifest.routes.length, 3);
  assertEquals(manifest.routes[0].pattern, "/");
  assertEquals(manifest.routes[1].pattern, "/products/:id");
  assertEquals(manifest.routes[2].pattern, "/users/:userId/posts/:postId");
});

Deno.test("loadRoutesManifest - roundtrip with file system", async () => {
  const tempDir = await Deno.makeTempDir();
  const manifestPath = join(tempDir, "routes-manifest.json");

  const routes: RouteManifestEntry[] = [
    {
      pattern: "/",
      filePath: "./routes/index.tsx",
      isApi: false,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
    {
      pattern: "/about",
      filePath: "./routes/about.tsx",
      isApi: false,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
  ];

  const originalManifest = generateRoutesManifest(
    routes,
    "2024-01-01T00:00:00Z",
    "1.0.0",
  );

  // Write manifest to temp file
  await Deno.writeTextFile(manifestPath, JSON.stringify(originalManifest));

  // Load it back
  const loadedManifest = await loadRoutesManifest(manifestPath);

  assertEquals(loadedManifest.routes.length, 2);
  assertEquals(loadedManifest.routes[0].pattern, "/");
  assertEquals(loadedManifest.routes[0].filePath, "./routes/index.tsx");
  assertEquals(loadedManifest.routes[0].isApi, false);
  assertEquals(loadedManifest.builtAt, "2024-01-01T00:00:00Z");
  assertEquals(loadedManifest.version, "1.0.0");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("loadRoutesManifest - preserves layout and middleware chain", async () => {
  const tempDir = await Deno.makeTempDir();
  const manifestPath = join(tempDir, "routes-manifest.json");

  const routes: RouteManifestEntry[] = [
    {
      pattern: "/admin",
      filePath: "./routes/admin.tsx",
      isApi: false,
      skipInheritedLayouts: true,
      layoutChain: ["./layouts/admin.tsx"],
      middlewareChain: ["./middleware/auth.ts"],
    },
  ];

  const originalManifest = generateRoutesManifest(
    routes,
    "2024-01-01T00:00:00Z",
    "1.0.0",
  );

  await Deno.writeTextFile(manifestPath, JSON.stringify(originalManifest));

  const loadedManifest = await loadRoutesManifest(manifestPath);

  assertEquals(loadedManifest.routes[0].layoutChain.length, 1);
  assertEquals(loadedManifest.routes[0].middlewareChain.length, 1);
  assertEquals(loadedManifest.routes[0].layoutChain[0], "./layouts/admin.tsx");
  assertEquals(
    loadedManifest.routes[0].middlewareChain[0],
    "./middleware/auth.ts",
  );

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("loadRoutesManifest - handles special characters in pattern", async () => {
  const tempDir = await Deno.makeTempDir();
  const manifestPath = join(tempDir, "routes-manifest.json");

  const routes: RouteManifestEntry[] = [
    {
      pattern: "/api/search",
      filePath: "./routes/api/search.ts",
      isApi: true,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
    {
      pattern: "/files/:filename(.*)",
      filePath: "./routes/files/[...path].tsx",
      isApi: false,
      skipInheritedLayouts: false,
      layoutChain: [],
      middlewareChain: [],
    },
  ];

  const originalManifest = generateRoutesManifest(
    routes,
    "2024-01-01T00:00:00Z",
    "1.0.0",
  );

  await Deno.writeTextFile(manifestPath, JSON.stringify(originalManifest));

  const loadedManifest = await loadRoutesManifest(manifestPath);

  assertEquals(loadedManifest.routes[0].pattern, "/api/search");
  assertEquals(loadedManifest.routes[1].pattern, "/files/:filename(.*)");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});
