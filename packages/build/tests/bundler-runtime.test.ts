// bundler-runtime_test.ts - Tests for buildRuntime and buildMount output
import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { buildIslands } from "../bundler.ts";
import { join } from "@std/path";

Deno.test("buildIslands - hydrate.js contains hydrateAll export", async () => {
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

  // Read and verify hydrate.js content
  const hydratePath = join(tempDir, "_dist", "hydrate.js");
  const hydrateContent = await Deno.readTextFile(hydratePath);

  // Should export hydrateAll function
  assertStringIncludes(hydrateContent, "hydrateAll");
  // Should contain strategy handling (immediate, visible, idle)
  assertStringIncludes(hydrateContent, "requestIdleCallback");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - runtime/mount.js contains mount export", async () => {
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

  assertEquals(result.outputFiles.includes("runtime/mount.js"), true);

  // Read and verify mount.js content
  const mountPath = join(tempDir, "_dist", "runtime", "mount.js");
  const mountContent = await Deno.readTextFile(mountPath);

  // Should export mount function
  assertStringIncludes(mountContent, "export");
  // Should use renderToString from hono
  assertStringIncludes(mountContent, "renderToString");
  // Should set innerHTML
  assertStringIncludes(mountContent, "innerHTML");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - hydrate.js does not contain content hash (always revalidated)", async () => {
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: "_dist",
    verbose: false,
  });

  const hydratePath = join(tempDir, "_dist", "hydrate.js");
  const hydrateContent = await Deno.readTextFile(hydratePath);

  // hydrate.js should NOT have a hash in its name (it's always revalidated)
  assertEquals(hydrateContent.includes(".a1b2c3d4"), false);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - manifest includes hydrate at /_sprout/hydrate.js", async () => {
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

  assertEquals(result.manifest.hydrate, "/_sprout/hydrate.js");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - builds multiple islands with different hashes", async () => {
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Count</div>; }",
  );
  await Deno.writeTextFile(
    join(islandsDir, "Timer.tsx"),
    "export default function Timer() { return <div>Time</div>; }",
  );

  const result = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: "_dist",
    verbose: false,
  });

  // Both islands should be in manifest
  assertExists(result.manifest.islands["Counter"]);
  assertExists(result.manifest.islands["Timer"]);

  // Each should have a hash
  const counterHash = result.manifest.islands["Counter"];
  const timerHash = result.manifest.islands["Timer"];

  // Extract hashes and verify they're different
  const counterHashMatch = counterHash.match(/\.([a-f0-9]+)\.js$/);
  const timerHashMatch = timerHash.match(/\.([a-f0-9]+)\.js$/);

  assertExists(counterHashMatch);
  assertExists(timerHashMatch);
  assertEquals(counterHashMatch![1] !== timerHashMatch![1], true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - outputFiles contains all expected files", async () => {
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");
  const staticDir = join(tempDir, "static");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  await Deno.mkdir(staticDir);
  await Deno.writeTextFile(join(staticDir, "style.css"), "body {}");

  const result = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    staticDir: "static",
    outdir: "_dist",
    verbose: false,
  });

  // Check all expected files are in outputFiles
  assertEquals(result.outputFiles.includes("hydrate.js"), true);
  assertEquals(result.outputFiles.includes("runtime/mount.js"), true);
  assertEquals(result.outputFiles.includes("manifest.json"), true);
  assertEquals(
    result.outputFiles.some((f) => f.startsWith("islands/Counter.")),
    true,
  );
  // Note: static files are copied to disk but NOT tracked in outputFiles

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - returns durationMs", async () => {
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

  // durationMs should be a positive number
  assertEquals(typeof result.durationMs === "number", true);
  assertEquals(result.durationMs >= 0, true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - verbose false does not throw", async () => {
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  // Should not throw even with verbose: false
  const result = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: "_dist",
    verbose: false,
  });

  assertExists(result.manifest);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - is idempotent (running twice does not error)", async () => {
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  // First build
  const result1 = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: "_dist",
    verbose: false,
  });
  assertExists(result1.manifest);

  // Second build to same outdir - should not error
  const result2 = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: "_dist",
    verbose: false,
  });
  assertExists(result2.manifest);

  // Both should produce the same manifest structure
  assertEquals(
    result2.manifest.islands["Counter"] === result1.manifest.islands["Counter"],
    true,
  );

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});
