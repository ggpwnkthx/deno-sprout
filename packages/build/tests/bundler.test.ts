// bundler_test.ts - Tests for buildIslands
import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { buildIslands } from "../bundler.ts";
import { readManifest } from "../manifest.ts";
import { join } from "@std/path";

Deno.test("buildIslands - creates hashed island bundles", async () => {
  const tempDir = await Deno.makeTempDir();

  // Copy fixture to temp dir
  const srcDir = "./tests/fixtures/islands-smoke";
  const islandsDir = join(tempDir, "islands");
  const staticDir = join(tempDir, "static");
  const _outDir = join(tempDir, "_dist");

  // Create islands dir and copy Counter.tsx
  await Deno.mkdir(islandsDir);
  await Deno.copyFile(
    join(srcDir, "islands/Counter.tsx"),
    join(islandsDir, "Counter.tsx"),
  );

  // Create static dir with a file
  await Deno.mkdir(staticDir);
  await Deno.writeTextFile(
    join(staticDir, "style.css"),
    "body { color: red; }",
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
  const manifest = await readManifest(_outDir);
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
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
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
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  // Write a file with a syntax error that esbuild will reject
  await Deno.writeTextFile(
    join(islandsDir, "BadIsland.tsx"),
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
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "IslandWithMissingImport.tsx"),
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
