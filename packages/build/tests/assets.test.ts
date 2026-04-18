// assets_test.ts - Tests for island asset management
import { assertEquals, assertExists } from "@std/assert";
import {
  copyStaticAssets,
  discoverIslands,
  writeIslandBundle,
} from "@ggpwnkthx/sprout-build/lib/assets";
import { join } from "@std/path";

Deno.test("discoverIslands - finds .tsx and .ts files", async () => {
  const islands = await discoverIslands(
    "./tests/fixtures/islands-smoke/islands",
  );

  assertEquals(islands.length >= 1, true);
  const counter = islands.find((i) => i.name === "Counter");
  assertExists(counter);
  assertEquals(counter!.name, "Counter");
});

Deno.test("discoverIslands - returns empty array for non-existent dir", async () => {
  const islands = await discoverIslands("/nonexistent/path");
  assertEquals(islands, []);
});

Deno.test("discoverIslands - returns empty array for existing but empty dir", async () => {
  const tempDir = await Deno.makeTempDir();
  const emptyIslandsDir = join(tempDir, "islands");
  await Deno.mkdir(emptyIslandsDir);

  const islands = await discoverIslands(emptyIslandsDir);
  assertEquals(islands, []);

  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("writeIslandBundle - creates file with correct name", async () => {
  const tempDir = await Deno.makeTempDir();
  const code = "console.log('test');";
  const hash = "a1b2c3d4";

  const filePath = await writeIslandBundle("Counter", code, hash, tempDir);

  assertEquals(filePath.includes("Counter.a1b2c3d4.js"), true);

  // Verify file contents
  const content = await Deno.readTextFile(filePath);
  assertEquals(content, code);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("copyStaticAssets - copies files to static dir", async () => {
  // Create a temp dir structure with static files
  const tempRoot = await Deno.makeTempDir();
  const staticDir = join(tempRoot, "static");
  const outDir = join(tempRoot, "_dist");

  // Create a static file
  await Deno.mkdir(staticDir);
  await Deno.writeTextFile(
    join(staticDir, "style.css"),
    "body { color: red; }",
  );

  await copyStaticAssets(staticDir, outDir);

  // Verify file was copied
  const copiedFile = join(outDir, "static", "style.css");
  const content = await Deno.readTextFile(copiedFile);
  assertEquals(content, "body { color: red; }");

  // Cleanup
  await Deno.remove(tempRoot, { recursive: true });
});

Deno.test("copyStaticAssets - handles non-existent static dir gracefully", async () => {
  const tempDir = await Deno.makeTempDir();

  // Should not throw
  await copyStaticAssets(join(tempDir, "nonexistent"), join(tempDir, "out"));

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("copyStaticAssets - is idempotent", async () => {
  const tempRoot = await Deno.makeTempDir();
  const staticDir = join(tempRoot, "static");
  const outDir = join(tempRoot, "_dist");

  // Create a static file
  await Deno.mkdir(staticDir);
  await Deno.writeTextFile(
    join(staticDir, "style.css"),
    "body { color: red; }",
  );

  // Run twice - should not error
  await copyStaticAssets(staticDir, outDir);
  await copyStaticAssets(staticDir, outDir);

  // Cleanup
  await Deno.remove(tempRoot, { recursive: true });
});
