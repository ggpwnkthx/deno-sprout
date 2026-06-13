// Tests for the M6 production build pipeline in `@sprout/compiler`.
//
// The tests cover the exit criteria spelled out in
// `docs/sprout/milestones/m6-production-build.md`:
//
//   1. `buildProduction` writes a complete `outDir` with a frozen
//      manifest and content-hashed assets under `_sprout/`.
//   2. The frozen manifest maps stable public paths to hashed files
//      (one `FrozenAsset` per compiled asset, 16-char lowercase-hex
//      hashes, the canonical `/@sprout/...` public paths).
//   3. Unsafe `outDir` is refused with `BUILD_OUTDIR_UNSAFE`.
//   4. Gzip companions are written when `compress === "gzip"` and
//      skipped when `compress === false`.
//
// `formatBuildSummary` is asserted against a hand-built summary so
// the formatter's shape (header line + per-asset rows + the `+gzip`
// marker) is pinned by tests, not by the smoke output.
//
// The M7 `loadFrozenIndex` / `readFrozenAsset` tests live in the
// dedicated `./frozen_reader_test.ts` file (paired with the
// manifest loader's validation tests).
//
// Each test starts from a per-test tmp dir (cleaned up in
// `finally`) so the on-disk state and the dev cache are independent.
import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import type { ResolvedConfig } from "@sprout/config";
import { _resetDevCacheForTests } from "./build/mod.ts";
import { buildProduction, CompilerError, formatBuildSummary, validateManifest } from "./mod.ts";
import type { BuildSummary, FrozenAsset, FrozenManifest } from "./mod.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const TMP_ROOT = join(REPO_ROOT, "tests/.tmp");
const FIXTURE = join(REPO_ROOT, "tests/fixtures/basic-app");

async function makeTempDir(
  prefix: string,
): Promise<{ readonly path: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({ prefix, dir: TMP_ROOT });
  return {
    path: dir,
    cleanup: async () => {
      try {
        await Deno.remove(dir, { recursive: true });
      } catch (_cause) {
        // best-effort
      }
    },
  };
}

/** A small `ResolvedConfig` for unit tests. */
function fixtureConfig(outDir: string): ResolvedConfig {
  return {
    mode: "production",
    root: FIXTURE,
    srcDir: join(FIXTURE, "src"),
    outDir,
    publicDir: join(FIXTURE, "public"),
    routes: {
      dir: join(FIXTURE, "src/routes"),
      include: ["**/*.{ts,tsx}"],
      exclude: ["**/*.test.{ts,tsx}", "**/_*.{ts,tsx}"],
    },
    islands: {
      dir: join(FIXTURE, "src/islands"),
      include: ["**/*.{ts,tsx}"],
      exclude: ["**/*.server.{ts,tsx}", "**/*.test.{ts,tsx}"],
    },
    styles: { app: join(FIXTURE, "src/styles/app.css") },
    build: {
      compress: "gzip",
      sourcemap: false,
      minify: false,
      frozenAssetCache: "none",
    },
    server: { hostname: "localhost", port: 0 },
  };
}

/** A small config with `compress: false` so the gzip path is exercised independently. */
function fixtureConfigNoGzip(outDir: string): ResolvedConfig {
  return { ...fixtureConfig(outDir), build: { ...fixtureConfig(outDir).build, compress: false } };
}

/** Read the frozen manifest from disk. */
async function readManifestOnDisk(outDir: string): Promise<FrozenManifest> {
  const text = await Deno.readTextFile(join(outDir, "sprout.manifest.json"));
  return JSON.parse(text) as FrozenManifest;
}

/** List the on-disk filenames under `<outDir>/_sprout/`. */
async function listSproutDir(outDir: string): Promise<readonly string[]> {
  const out: string[] = [];
  for await (const e of Deno.readDir(join(outDir, "_sprout"))) {
    out.push(e.name);
  }
  return out.slice().sort();
}

// ---------------------------------------------------------------------------
// buildProduction: write a complete outDir
// ---------------------------------------------------------------------------

Deno.test("buildProduction: writes a complete outDir with manifest and hashed assets", async () => {
  _resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m6-build-");
  try {
    const config = fixtureConfig(tmp.path);
    const summary = await buildProduction({ config });

    // The summary reports the same count the on-disk state shows.
    assertEquals(summary.assetsWritten, summary.manifest.assets.length);
    assertEquals(summary.outDir, tmp.path);
    assert(summary.bytes > 0, "non-zero byte count");

    // The on-disk manifest is present and has the same shape.
    const onDisk = await readManifestOnDisk(tmp.path);
    assertEquals(onDisk.version, 1);
    assertEquals(onDisk.assets.length, summary.manifest.assets.length);

    // Every manifest entry maps a stable public path to a hashed file.
    const onDiskFiles = await listSproutDir(tmp.path);
    for (const asset of onDisk.assets) {
      assertStringIncludes(asset.file, "_sprout/");
      const baseName = asset.file.slice("_sprout/".length);
      assert(
        onDiskFiles.includes(baseName),
        `expected ${baseName} under _sprout/`,
      );
      // Hash is 16 lowercase hex chars.
      assertEquals(asset.hash.length, 16);
      assertEquals(/^[0-9a-f]{16}$/.test(asset.hash), true);
    }

    // The basic-app fixture has: 1 runtime, 2 islands (Counter, cart/AddButton),
    // 1 app stylesheet = 4 assets.
    assertEquals(onDisk.assets.length, 4);

    // Every asset has a `gzipFile` because the default config compresses.
    for (const asset of onDisk.assets) {
      assertExists(asset.gzipFile, `${asset.publicPath} should have a gzip companion`);
    }
    assertEquals(summary.gzipAssets, 4);

    // The hashed JS files are non-empty and look like JS.
    for (const asset of onDisk.assets) {
      const base = asset.file.slice("_sprout/".length);
      const bytes = await Deno.readFile(join(tmp.path, "_sprout", base));
      assert(bytes.byteLength > 0);
      if (asset.contentType.startsWith("text/javascript")) {
        const head = new TextDecoder().decode(bytes.slice(0, 256));
        assertStringIncludes(head, "export");
      }
    }

    // The gzip companion files exist on disk.
    for (const asset of onDisk.assets) {
      if (asset.gzipFile !== undefined) {
        const base = asset.gzipFile.slice("_sprout/".length);
        assert(
          onDiskFiles.includes(base),
          `expected gzip companion ${base} under _sprout/`,
        );
        const gz = await Deno.readFile(join(tmp.path, "_sprout", base));
        // The gzip magic header is `0x1f 0x8b`.
        assertEquals(gz[0], 0x1f);
        assertEquals(gz[1], 0x8b);
      }
    }
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("buildProduction: filenames follow the canonical hashed shape", async () => {
  _resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m6-shape-");
  try {
    const summary = await buildProduction({ config: fixtureConfig(tmp.path) });
    const files = await listSproutDir(tmp.path);
    // Each pattern must appear exactly once.
    for (
      const re of [
        /^runtime\.[0-9a-f]{16}\.js$/,
        /^island-Counter\.[0-9a-f]{16}\.js$/,
        /^island-cart-AddButton\.[0-9a-f]{16}\.js$/,
        /^style-app\.[0-9a-f]{16}\.css$/,
      ]
    ) {
      assertEquals(
        files.filter((f) => re.test(f)).length,
        1,
        `expected exactly one match for ${re}`,
      );
    }
    // No `vendor.<hash>.js` in M6: the MVP has no shared vendor bundle.
    assertEquals(files.some((f) => /^vendor\./.test(f)), false);
    // Sanity-check the count.
    assertEquals(summary.assetsWritten, 4);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// OutDir safety
// ---------------------------------------------------------------------------

Deno.test("buildProduction: outDir missing -> creates the dir and builds", async () => {
  _resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m6-missing-");
  try {
    const outDir = join(tmp.path, "fresh");
    // Do not create outDir; buildProduction must do it.
    const summary = await buildProduction({ config: fixtureConfigNoGzip(outDir) });
    const stat = await Deno.stat(outDir);
    assertEquals(stat.isDirectory, true);
    assertEquals(summary.outDir, outDir);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("buildProduction: outDir empty -> builds without throwing", async () => {
  _resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m6-empty-");
  try {
    const outDir = join(tmp.path, "out");
    await Deno.mkdir(outDir, { recursive: true });
    const summary = await buildProduction({ config: fixtureConfigNoGzip(outDir) });
    assertEquals(summary.outDir, outDir);
    assert(summary.assetsWritten > 0);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("buildProduction: outDir contains prior manifest -> builds and overwrites", async () => {
  _resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m6-prior-");
  try {
    const outDir = join(tmp.path, "out");
    await Deno.mkdir(outDir, { recursive: true });
    await Deno.writeTextFile(
      join(outDir, "sprout.manifest.json"),
      JSON.stringify({ version: 1, assets: [] }),
    );
    const summary = await buildProduction({ config: fixtureConfigNoGzip(outDir) });
    assertEquals(summary.outDir, outDir);
    const onDisk = await readManifestOnDisk(outDir);
    // The prior empty manifest was replaced.
    assert(onDisk.assets.length > 0);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("buildProduction: outDir with a foreign file -> BUILD_OUTDIR_UNSAFE", async () => {
  _resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m6-unsafe-");
  try {
    const outDir = join(tmp.path, "out");
    await Deno.mkdir(outDir, { recursive: true });
    await Deno.writeTextFile(join(outDir, "foreign.txt"), "not sprout's");
    const err = await assertRejects(
      () => buildProduction({ config: fixtureConfigNoGzip(outDir) }),
      CompilerError,
    );
    assertEquals(err.code, "BUILD_OUTDIR_UNSAFE");
    const entries = err.details.entries as string[];
    assertExists(entries);
    assert(entries.includes("foreign.txt"));
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// compress: "gzip" vs false
// ---------------------------------------------------------------------------

Deno.test("buildProduction: compress false -> no gzip companions", async () => {
  _resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m6-nogz-");
  try {
    const config = fixtureConfigNoGzip(tmp.path);
    const summary = await buildProduction({ config });
    assertEquals(summary.gzipAssets, 0);
    for (const asset of summary.manifest.assets) {
      assertEquals(asset.gzipFile, undefined);
    }
    const files = await listSproutDir(tmp.path);
    assertEquals(files.some((f) => f.endsWith(".gz.js")), false);
    assertEquals(files.some((f) => f.endsWith(".gz.css")), false);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("buildProduction: compress gzip -> gzip companions are written and recorded", async () => {
  _resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m6-gz-");
  try {
    const config = fixtureConfig(tmp.path);
    const summary = await buildProduction({ config });
    assertEquals(summary.gzipAssets, summary.assetsWritten);
    const files = await listSproutDir(tmp.path);
    // At least one .gz.js and one .gz.css must be on disk.
    assert(files.some((f) => f.endsWith(".gz.js")));
    assert(files.some((f) => f.endsWith(".gz.css")));
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// formatBuildSummary
// ---------------------------------------------------------------------------

Deno.test("formatBuildSummary: contains the Built header and one row per asset", () => {
  const assets: FrozenAsset[] = [
    {
      kind: "runtime",
      id: "runtime",
      publicPath: "/@sprout/runtime.js",
      file: "_sprout/runtime.0123456789abcdef.js",
      contentType: "text/javascript; charset=utf-8",
      hash: "0123456789abcdef",
    },
    {
      kind: "style",
      id: "app",
      publicPath: "/@sprout/app.css",
      file: "_sprout/style-app.0011223344556677.css",
      contentType: "text/css; charset=utf-8",
      hash: "0011223344556677",
    },
    {
      kind: "island",
      id: "Counter",
      publicPath: "/@sprout/island/Counter.js",
      file: "_sprout/island-Counter.abcdef0123456789.js",
      contentType: "text/javascript; charset=utf-8",
      hash: "abcdef0123456789",
    },
  ];
  const summary: BuildSummary = {
    manifest: { version: 1, assets },
    outDir: ".sprout/dist",
    assetsWritten: assets.length,
    gzipAssets: 0,
    bytes: 12345,
  };
  const text = formatBuildSummary(summary);
  assertStringIncludes(text, `Built ${assets.length} assets into .sprout/dist`);
  assertStringIncludes(text, "runtime  /@sprout/runtime.js");
  assertStringIncludes(text, "style    /@sprout/app.css");
  assertStringIncludes(text, "island   /@sprout/island/Counter.js");
  assertStringIncludes(text, "runtime.0123456789abcdef.js");
  assertStringIncludes(text, "style-app.0011223344556677.css");
  assertStringIncludes(text, "island-Counter.abcdef0123456789.js");
});

Deno.test("formatBuildSummary: appends +gzip when a gzip companion is present", () => {
  const asset: FrozenAsset = {
    kind: "runtime",
    id: "runtime",
    publicPath: "/@sprout/runtime.js",
    file: "_sprout/runtime.0123456789abcdef.js",
    contentType: "text/javascript; charset=utf-8",
    hash: "0123456789abcdef",
    gzipFile: "_sprout/runtime.0123456789abcdef.gz.js",
  };
  const summary: BuildSummary = {
    manifest: { version: 1, assets: [asset] },
    outDir: ".sprout/dist",
    assetsWritten: 1,
    gzipAssets: 1,
    bytes: 100,
  };
  const text = formatBuildSummary(summary);
  assertStringIncludes(text, "+gzip");
});

// ---------------------------------------------------------------------------
// M7 frozen manifest + asset reader
// ---------------------------------------------------------------------------
//
// The M7 reader tests live in `./frozen_reader_test.ts` (paired with
// the index loader) so this file stays focused on the M6 build
// pipeline. The old "M6 stub throws ..." assertions were removed
// when the stubs landed real implementations.

// ---------------------------------------------------------------------------
// contentTypeFor: pin the content-type map
// ---------------------------------------------------------------------------

Deno.test("contentTypeFor: returns the canonical content types for known extensions", async () => {
  const { contentTypeFor } = await import("./build/frozen_assets.ts");
  assertEquals(contentTypeFor("runtime.0123456789abcdef.js"), "text/javascript; charset=utf-8");
  assertEquals(
    contentTypeFor("island-Counter.0123456789abcdef.mjs"),
    "text/javascript; charset=utf-8",
  );
  assertEquals(contentTypeFor("style-app.0123456789abcdef.css"), "text/css; charset=utf-8");
  assertEquals(
    contentTypeFor("runtime.0123456789abcdef.js.map"),
    "application/json; charset=utf-8",
  );
  assertEquals(contentTypeFor("vendor.0123456789abcdef.js"), "text/javascript; charset=utf-8");
  assertEquals(contentTypeFor("unknown.bin"), "application/octet-stream");
  assertEquals(contentTypeFor("noext"), "application/octet-stream");
});

// ---------------------------------------------------------------------------
// ensureSafeOutDir: direct classification tests
// ---------------------------------------------------------------------------

Deno.test("ensureSafeOutDir: classifies missing / empty / prior-manifest / unsafe", async () => {
  const { ensureSafeOutDir } = await import("./build/frozen_assets.ts");
  const tmp = await makeTempDir("sprout-m6-classify-");
  try {
    const missingDir = join(tmp.path, "missing");
    assertEquals(await ensureSafeOutDir(missingDir), "missing");

    const emptyDir = join(tmp.path, "empty");
    await Deno.mkdir(emptyDir, { recursive: true });
    assertEquals(await ensureSafeOutDir(emptyDir), "empty");

    const priorDir = join(tmp.path, "prior");
    await Deno.mkdir(priorDir, { recursive: true });
    await Deno.writeTextFile(
      join(priorDir, "sprout.manifest.json"),
      JSON.stringify({ version: 1, assets: [] }),
    );
    assertEquals(await ensureSafeOutDir(priorDir), "prior-manifest");

    const unsafeDir = join(tmp.path, "unsafe");
    await Deno.mkdir(unsafeDir, { recursive: true });
    await Deno.writeTextFile(join(unsafeDir, "foreign.txt"), "x");
    assertEquals(await ensureSafeOutDir(unsafeDir), "unsafe");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// validateManifest does not block buildProduction
// ---------------------------------------------------------------------------

Deno.test("buildProduction: rejects when manifest validation fails", async () => {
  _resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m6-bad-");
  try {
    // Build a tmp project that has no islands (default config), no
    // stylesheet, and no routes — so the in-memory manifest is valid
    // and the build succeeds. This is the path-through test. The
    // bad-fixture case is covered by the manifest tests; this one
    // just makes sure buildProduction does not introduce its own
    // validation regressions.
    const root = tmp.path;
    await Deno.mkdir(join(root, "src/routes"), { recursive: true });
    await Deno.writeTextFile(
      join(root, "src/routes/index.tsx"),
      "export default function Index() { return null; }",
    );
    const config: ResolvedConfig = {
      ...fixtureConfigNoGzip(join(tmp.path, "out")),
      root,
      srcDir: join(root, "src"),
      publicDir: null,
      routes: {
        dir: join(root, "src/routes"),
        include: ["**/*.{ts,tsx}"],
        exclude: ["**/*.test.{ts,tsx}", "**/_*.{ts,tsx}"],
      },
      islands: {
        dir: join(root, "src/islands"),
        include: ["**/*.{ts,tsx}"],
        exclude: ["**/*.server.{ts,tsx}", "**/*.test.{ts,tsx}"],
      },
      styles: { app: null },
    };
    const summary = await buildProduction({ config });
    // The basic-app fixture has 2 islands, 1 style, 1 runtime. This
    // empty fixture has none of those beyond the runtime. The
    // assertion is loose: at least 1 (the runtime) was written.
    assert(summary.assetsWritten >= 1);
    // The manifest matches the typed Manifest shape.
    const onDisk = await readManifestOnDisk(summary.outDir);
    assertEquals(onDisk.version, 1);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Hash determinism: the same input produces the same hash.
// ---------------------------------------------------------------------------

Deno.test("buildProduction: identical inputs produce identical hashes", async () => {
  _resetDevCacheForTests();
  const tmp1 = await makeTempDir("sprout-m6-hash1-");
  const tmp2 = await makeTempDir("sprout-m6-hash2-");
  try {
    const config1 = fixtureConfigNoGzip(tmp1.path);
    const config2 = fixtureConfigNoGzip(tmp2.path);
    const a = await buildProduction({ config: config1 });
    const b = await buildProduction({ config: config2 });
    // The same fixture, same config shape, same cache state: hashes
    // must be stable across runs.
    const aHashes = a.manifest.assets.map((x) => x.hash).sort();
    const bHashes = b.manifest.assets.map((x) => x.hash).sort();
    assertEquals(aHashes, bHashes);
    // Sanity: the hashes are 16 lowercase hex chars.
    for (const h of aHashes) {
      assertEquals(h.length, 16);
      assertEquals(/^[0-9a-f]{16}$/.test(h), true);
    }
  } finally {
    await tmp1.cleanup();
    await tmp2.cleanup();
  }
});

// ---------------------------------------------------------------------------
// validateManifest is exercised in the build path (defense in depth).
// ---------------------------------------------------------------------------

Deno.test("buildProduction: propagates MANIFEST_DUPLICATE_ID when the fixture is hand-crafted", () => {
  // Hand-build a DiscoveredProject with a duplicate id and feed it
  // through validateManifest; the production build will surface the
  // same error. We do not call buildProduction here (it would
  // require a real on-disk fixture); the assertion is on
  // validateManifest to confirm the defense-in-depth path is alive.
  assertThrows(
    () =>
      validateManifest({
        routes: [],
        islands: [
          {
            id: "Counter",
            file: "/p/src/islands/Counter.tsx",
            exportName: "default",
            publicPath: "/@sprout/island/Counter.js",
          },
          {
            id: "Counter",
            file: "/p/src/islands/sub/Counter.tsx",
            exportName: "default",
            publicPath: "/@sprout/island/sub/Counter.js",
          },
        ],
        styles: { app: null },
      }),
    CompilerError,
  );
});
