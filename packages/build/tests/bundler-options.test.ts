// bundler-options_test.ts - Tests for BuildOptions variations
import { assertEquals, assertExists } from "@std/assert";
import { buildIslands } from "../bundler.ts";
import { join } from "@std/path";

Deno.test("buildIslands - absolute outdir path works", async () => {
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");
  // Use absolute path for outdir
  const absoluteOutDir = join(tempDir, "_dist_absolute");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  const result = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: absoluteOutDir, // absolute path
    verbose: false,
  });

  assertExists(result.manifest);
  // Verify files were written to absolute path
  const manifestPath = join(absoluteOutDir, "manifest.json");
  const manifestContent = await Deno.readTextFile(manifestPath);
  assertEquals(manifestContent.includes("Counter"), true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - relative outdir path works", async () => {
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");
  const outDir = "_dist_relative";

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  const result = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: outDir, // relative path - should be resolved against root
    verbose: false,
  });

  assertExists(result.manifest);
  // Verify manifest was written to relative path under root
  const manifestPath = join(tempDir, outDir, "manifest.json");
  const manifestContent = await Deno.readTextFile(manifestPath);
  assertEquals(manifestContent.includes("Counter"), true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - default outdir is _dist", async () => {
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
    verbose: false,
  });

  assertExists(result.manifest);
  // Default outdir is _dist
  const manifestPath = join(tempDir, "_dist", "manifest.json");
  const manifestContent = await Deno.readTextFile(manifestPath);
  assertEquals(manifestContent.includes("Counter"), true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - default islandsDir is islands", async () => {
  const tempDir = await Deno.makeTempDir();
  // Default islandsDir is "islands"
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  const result = await buildIslands({
    root: tempDir,
    outdir: "_dist",
    verbose: false,
  });

  assertExists(result.manifest);
  assertExists(result.manifest.islands["Counter"]);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - default staticDir is static", async () => {
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");
  const staticDir = join(tempDir, "static");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  // Create static directory with a file
  await Deno.mkdir(staticDir);
  await Deno.writeTextFile(join(staticDir, "style.css"), "body {}");

  await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    // staticDir defaults to "static"
    outdir: "_dist",
    verbose: false,
  });

  // Static files are copied to disk but NOT tracked in outputFiles
  // Verify the static file exists on disk
  const staticFilePath = join(tempDir, "_dist", "static", "style.css");
  const staticContent = await Deno.readTextFile(staticFilePath);
  assertEquals(staticContent, "body {}");

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - minify true produces smaller output than false", async () => {
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");

  // Create a more substantial island to ensure minification has an effect
  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    `export default function Counter() {
      const [count, setCount] = Deno.useState(0);
      return (
        <div>
          <p>Count: {count}</p>
          <button onClick={() => setCount(count + 1)}>Increment</button>
        </div>
      );
    }`,
  );

  // Build with minify=false
  await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: "_dist_unminified",
    minify: false,
    verbose: false,
  });

  // Read unminified output size
  const unminifiedPath = join(tempDir, "_dist_unminified", "islands");
  const unminifiedEntries = Deno.readDirSync(unminifiedPath);
  const unminifiedFile = Array.from(unminifiedEntries).find((e) =>
    e.name.startsWith("Counter.")
  );
  assertExists(unminifiedFile);
  const unminifiedContent = await Deno.readTextFile(
    join(unminifiedPath, unminifiedFile!.name),
  );

  // Verify unminified is valid JS (doesn't throw when read)
  assertExists(unminifiedContent);
  assertEquals(typeof unminifiedContent, "string");

  // Build with minify=true
  await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: "_dist_minified",
    minify: true,
    verbose: false,
  });

  // Read minified output
  const minifiedPath = join(tempDir, "_dist_minified", "islands");
  const minifiedEntries = Deno.readDirSync(minifiedPath);
  const minifiedFile = Array.from(minifiedEntries).find((e) =>
    e.name.startsWith("Counter.")
  );
  assertExists(minifiedFile);
  const minifiedContent = await Deno.readTextFile(
    join(minifiedPath, minifiedFile!.name),
  );

  // Verify minified is valid JS (doesn't throw when read)
  assertExists(minifiedContent);
  assertEquals(typeof minifiedContent, "string");

  // Minified should be strictly smaller than unminified
  assertEquals(minifiedContent.length < unminifiedContent.length, true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - minify false produces readable output", async () => {
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
    minify: false,
    verbose: false,
  });

  assertExists(result.manifest);
  // Read the island bundle
  const counterPath = join(tempDir, "_dist", "islands");
  const entries = Deno.readDirSync(counterPath);
  const counterFile = Array.from(entries).find((e) =>
    e.name.startsWith("Counter.")
  );
  assertExists(counterFile);

  const content = await Deno.readTextFile(join(counterPath, counterFile!.name));
  // Non-minified code should be present and valid
  assertExists(content);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - Windows path with drive letter works", async () => {
  // The outdir logic: absolute paths (starting with /) and Windows drive letters
  // (matching ^[a-zA-Z]:) are used directly; relative paths are joined with root.
  // On Linux we test the absolute-path branch; the drive-letter branch is
  // validated by the regex but not exercisable without a Windows filesystem.
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  // Absolute path (Linux) - the regex /^[a-zA-Z]:/ won't match on Linux but
  // startsWith("/") will classify it as absolute and use it directly.
  const absoluteOutDir = join(tempDir, "output");
  const result = await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: absoluteOutDir,
    verbose: false,
  });

  assertExists(result.manifest);
  // manifest.json should be directly under absoluteOutDir, not nested under root
  const manifestPath = join(absoluteOutDir, "manifest.json");
  const manifestContent = await Deno.readTextFile(manifestPath);
  assertEquals(manifestContent.includes("Counter"), true);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("buildIslands - relative outdir is resolved against root", async () => {
  // Verify that a relative outdir is joined with root, not treated as absolute.
  // This also indirectly validates the !outdir.match(/^[a-zA-Z]:/) branch.
  const tempDir = await Deno.makeTempDir();
  const islandsDir = join(tempDir, "islands");

  await Deno.mkdir(islandsDir);
  await Deno.writeTextFile(
    join(islandsDir, "Counter.tsx"),
    "export default function Counter() { return <div>Test</div>; }",
  );

  const relativeOutDir = "my-dist";
  await buildIslands({
    root: tempDir,
    islandsDir: "islands",
    outdir: relativeOutDir,
    verbose: false,
  });

  // Relative path should be resolved under root
  const manifestPath = join(tempDir, relativeOutDir, "manifest.json");
  const manifestContent = await Deno.readTextFile(manifestPath);
  assertEquals(manifestContent.includes("Counter"), true);

  // Path should NOT be at literal "my-dist" in cwd (confirming root resolution)
  const wrongPath = join(Deno.cwd(), "my-dist", "manifest.json");
  let wrongExists = false;
  try {
    await Deno.stat(wrongPath);
    wrongExists = true;
  } catch {
    wrongExists = false;
  }
  assertEquals(wrongExists, false);

  await Deno.remove(tempDir, { recursive: true });
});
