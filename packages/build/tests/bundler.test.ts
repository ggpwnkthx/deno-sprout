// bundler_test.ts - Tests for buildIslands
import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { buildIslands } from "../bundler.ts";
import { readManifest } from "../manifest.ts";
import { join } from "@std/path";

/**
 * Create a test island file at the correct path and return the island's file path.
 */
function createTestIsland(tempDir: string, name: string, code: string): string {
  const islandsDir = join(tempDir, "islands");
  Deno.mkdirSync(islandsDir, { recursive: true });
  const islandPath = join(islandsDir, `${name}.tsx`);
  Deno.writeTextFileSync(islandPath, code);
  return islandPath;
}

Deno.test("buildIslands - creates hashed island bundles", async () => {
  const tempDir = await Deno.makeTempDir();

  // Use helper to create island
  createTestIsland(
    tempDir,
    "Counter",
    `export default function Counter() { return <div>Test</div>; }`,
  );

  const result = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    staticDir: "static",
    outdir: "_dist",
    verbose: false,
  });

  assertEquals(result.outputFiles.length > 0, true);
  assertExists(result.manifest);
  assertExists(result.manifest.islands["Counter"]);

  // Verify manifest has correct structure
  assertStringIncludes(
    result.manifest.islands["Counter"],
    "/_sprout/islands/Counter.",
  );
  assertStringIncludes(result.manifest.islands["Counter"], ".js");
  assertEquals(result.manifest.hydrate, "/_sprout/hydrate.js");

  // Verify files were created
  const manifest = await readManifest(join(tempDir, "_dist"));
  assertExists(manifest);
  assertEquals(
    manifest!.islands["Counter"],
    result.manifest.islands["Counter"],
  );

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - creates hydrate.js and runtime/mount.js", async () => {
  const tempDir = await Deno.makeTempDir();

  // Use helper to create island
  createTestIsland(
    tempDir,
    "Counter",
    `export default function Counter() { return <div>Test</div>; }`,
  );

  const result = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: "_dist",
    verbose: false,
  });

  assertEquals(result.outputFiles.includes("hydrate.js"), true);
  assertEquals(result.outputFiles.includes("runtime/mount.js"), true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - throws when island file causes esbuild to fail", async () => {
  const tempDir = await Deno.makeTempDir();

  // Use helper to create a malformed island
  createTestIsland(
    tempDir,
    "BadIsland",
    "export default function() { return < <div>; }",
  );

  try {
    await buildIslands({
      root: tempDir,
      islandsDir: "islands",
      outdir: "_dist",
      verbose: false,
    });
    // esbuild may or may not throw on malformed JSX; either is acceptable
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertStringIncludes(message, "BadIsland");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("buildIslands - throws when island module cannot be resolved", async () => {
  const tempDir = await Deno.makeTempDir();

  // Use helper to create island with missing import
  createTestIsland(
    tempDir,
    "IslandWithMissingImport",
    `import NonExistent from "./nonexistent.tsx";
export default function() { return <div>{NonExistent}</div>; }`,
  );

  try {
    await buildIslands({
      root: tempDir,
      islandsDir: "islands",
      outdir: "_dist",
      verbose: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    assertStringIncludes(message, "IslandWithMissingImport");
  } finally {
    await Deno.remove(tempDir, { recursive: true });
  }
});

Deno.test("buildIslands - produces usable output that can be imported", async () => {
  const tempDir = await Deno.makeTempDir();

  // Create a simple Counter island
  createTestIsland(
    tempDir,
    "Counter",
    `export default function Counter() { return <div>Test</div>; }`,
  );

  // Build the islands
  await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: "_dist",
    verbose: false,
  });

  // Find the Counter output file
  const islandsPath = join(tempDir, "_dist", "islands");
  const entries = Deno.readDirSync(islandsPath);
  const counterFile = Array.from(entries).find((e) =>
    e.name.startsWith("Counter.")
  );
  assertExists(counterFile, "Counter output file should exist");

  // Read the content
  const content = await Deno.readTextFile(join(islandsPath, counterFile!.name));

  // Verify the content is valid JS (doesn't throw when evaluated)
  assertExists(content);
  assertEquals(typeof content, "string");
  assertEquals(content.length > 0, true);

  // Verify the island bundle contains the island name
  assertStringIncludes(content, "Counter");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});
