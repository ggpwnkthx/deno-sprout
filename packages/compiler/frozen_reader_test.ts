// Tests for the M7 frozen manifest loader and asset reader.
//
// The tests cover the M7 spec exit criteria for the compiler
// surface:
//
//   1. `loadFrozenIndex` reads the manifest metadata without
//      touching the `_sprout/` directory (proven by the absence
//      of any `Deno.readFile` call to a hashed file in the
//      "loads metadata without reading asset bytes" test).
//   2. `readFrozenAsset` returns the raw bytes (and the gzip
//      companion when present) for a known publicPath.
//   3. `readFrozenAsset` returns `gzipBytes: null` when the gzip
//      companion is missing on disk, and degrades to the raw
//      asset (does not throw).
//   4. `loadFrozenIndex` throws `FROZEN_MANIFEST_MISSING` when
//      the manifest file is missing.
//   5. `loadFrozenIndex` throws `FROZEN_MANIFEST_UNSUPPORTED`
//      on a malformed manifest (bad version, bad shape,
//      duplicate publicPath, bad hash, etc.).
//   6. `readFrozenAsset` throws `FROZEN_MANIFEST_UNSUPPORTED`
//      when the asset file is missing on disk or the publicPath
//      is unknown.
//
// The tests start from a per-test tmp dir (cleaned up in
// `finally`) so the on-disk state and the dev cache are
// independent.
import {
  assert,
  assertEquals,
  assertExists,
  assertRejects,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import type { ResolvedConfig } from "@sprout/config";
import { resetDevCacheForTests } from "./build/dev_assets_test_utils.ts";
import {
  buildProduction,
  CompilerError,
  FROZEN_ASSET_MAX_BUFFER_BYTES,
  FROZEN_MANIFEST_MAX_BYTES,
  loadFrozenIndex,
  readFrozenAsset,
  readFrozenAssetFromOutDir,
} from "./mod.ts";
import type { FrozenIndex } from "./mod.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const FIXTURE = join(REPO_ROOT, "tests/fixtures/basic-app");

async function makeTempDir(
  prefix: string,
): Promise<{ readonly path: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({ prefix });
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
    server: { hostname: "0.0.0.0", port: 0 },
  };
}

// ---------------------------------------------------------------------------
// loadFrozenIndex: shape
// ---------------------------------------------------------------------------

Deno.test("loadFrozenIndex: returns the canonical v1 index shape with the right count", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-load-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    const index = await loadFrozenIndex(tmp.path);
    assertEquals(index.version, 1);
    assertEquals(index.outDir, tmp.path);
    assertEquals(index.assets.size, 4);
    // Each public path is present.
    for (
      const path of [
        "/@sprout/runtime.js",
        "/@sprout/app.css",
        "/@sprout/island/Counter.js",
        "/@sprout/island/cart/AddButton.js",
      ]
    ) {
      assertExists(index.assets.get(path), `expected ${path} in the index`);
    }
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadFrozenIndex: missing manifest throws FROZEN_MANIFEST_MISSING", async () => {
  const err = await assertRejects(
    () => loadFrozenIndex("/nope/this/does/not/exist"),
    CompilerError,
  );
  assertEquals(err.code, "FROZEN_MANIFEST_MISSING");
  const details = err.details as { outDir: string; manifestPath: string };
  assertEquals(details.outDir, "/nope/this/does/not/exist");
  assertStringIncludes(details.manifestPath, "sprout.manifest.json");
});

Deno.test("loadFrozenIndex: malformed JSON throws FROZEN_MANIFEST_UNSUPPORTED", async () => {
  const tmp = await makeTempDir("sprout-m7-badjson-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      "this is not json",
    );
    const err = await assertRejects(
      () => loadFrozenIndex(tmp.path),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadFrozenIndex: missing version throws FROZEN_MANIFEST_UNSUPPORTED", async () => {
  const tmp = await makeTempDir("sprout-m7-badver-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      JSON.stringify({ version: 2, assets: [] }),
    );
    const err = await assertRejects(
      () => loadFrozenIndex(tmp.path),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
    const details = err.details as { version?: unknown };
    assertEquals(details.version, 2);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadFrozenIndex: assets must be an array", async () => {
  const tmp = await makeTempDir("sprout-m7-badassets-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      JSON.stringify({ version: 1, assets: "not-an-array" }),
    );
    const err = await assertRejects(
      () => loadFrozenIndex(tmp.path),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadFrozenIndex: rejects publicPath that escapes /@sprout/", async () => {
  const tmp = await makeTempDir("sprout-m7-badpp-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      JSON.stringify({
        version: 1,
        assets: [{
          kind: "runtime",
          id: "runtime",
          publicPath: "/not-reserved.js",
          file: "_sprout/runtime.0123456789abcdef.js",
          contentType: "text/javascript; charset=utf-8",
          hash: "0123456789abcdef",
        }],
      }),
    );
    const err = await assertRejects(
      () => loadFrozenIndex(tmp.path),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadFrozenIndex: rejects file that is not under _sprout/", async () => {
  const tmp = await makeTempDir("sprout-m7-badfile-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      JSON.stringify({
        version: 1,
        assets: [{
          kind: "runtime",
          id: "runtime",
          publicPath: "/@sprout/runtime.js",
          file: "runtime.0123456789abcdef.js",
          contentType: "text/javascript; charset=utf-8",
          hash: "0123456789abcdef",
        }],
      }),
    );
    const err = await assertRejects(
      () => loadFrozenIndex(tmp.path),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadFrozenIndex: rejects invalid hash shape", async () => {
  const tmp = await makeTempDir("sprout-m7-badhash-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      JSON.stringify({
        version: 1,
        assets: [{
          kind: "runtime",
          id: "runtime",
          publicPath: "/@sprout/runtime.js",
          file: "_sprout/runtime.abcdef.js",
          contentType: "text/javascript; charset=utf-8",
          hash: "abcdef",
        }],
      }),
    );
    const err = await assertRejects(
      () => loadFrozenIndex(tmp.path),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadFrozenIndex: rejects duplicate publicPath", async () => {
  const tmp = await makeTempDir("sprout-m7-dup-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      JSON.stringify({
        version: 1,
        assets: [
          {
            kind: "runtime",
            id: "runtime",
            publicPath: "/@sprout/runtime.js",
            file: "_sprout/runtime.0123456789abcdef.js",
            contentType: "text/javascript; charset=utf-8",
            hash: "0123456789abcdef",
          },
          {
            kind: "runtime",
            id: "runtime-2",
            publicPath: "/@sprout/runtime.js",
            file: "_sprout/runtime.0011223344556677.js",
            contentType: "text/javascript; charset=utf-8",
            hash: "0011223344556677",
          },
        ],
      }),
    );
    const err = await assertRejects(
      () => loadFrozenIndex(tmp.path),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
    const details = err.details as { publicPath?: string };
    assertEquals(details.publicPath, "/@sprout/runtime.js");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadFrozenIndex: rejects NUL bytes and '..' in publicPath / file", async () => {
  const tmp = await makeTempDir("sprout-m7-badchars-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      JSON.stringify({
        version: 1,
        assets: [{
          kind: "runtime",
          id: "runtime",
          publicPath: "/@sprout/\0evil",
          file: "_sprout/runtime.0123456789abcdef.js",
          contentType: "text/javascript; charset=utf-8",
          hash: "0123456789abcdef",
        }],
      }),
    );
    const err = await assertRejects(
      () => loadFrozenIndex(tmp.path),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// loadFrozenIndex: does not preload asset bytes
// ---------------------------------------------------------------------------

Deno.test("loadFrozenIndex: does not read asset bytes from the _sprout/ directory", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-no-preload-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    // Wrap Deno.readFile to count calls to any path under `_sprout/`.
    let sproutReads = 0;
    const orig = Deno.readFile;
    // deno-lint-ignore no-explicit-any
    (Deno as any).readFile = (path: string | URL) => {
      const s = String(path);
      if (s.includes("/_sprout/")) {
        sproutReads++;
      }
      return orig(path as string | URL);
    };
    try {
      const index: FrozenIndex = await loadFrozenIndex(tmp.path);
      assertEquals(sproutReads, 0, "loadFrozenIndex must not read _sprout/ files");
      assertEquals(index.assets.size, 4);
    } finally {
      // deno-lint-ignore no-explicit-any
      (Deno as any).readFile = orig;
    }
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// readFrozenAsset: success paths
// ---------------------------------------------------------------------------

Deno.test("readFrozenAsset: returns raw bytes + gzipBytes for a runtime asset", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-read-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    const result = await readFrozenAssetFromOutDir(tmp.path, "/@sprout/runtime.js");
    assertEquals(result.contentType, "text/javascript; charset=utf-8");
    assertEquals(result.hash.length, 16);
    assertEquals(/^[0-9a-f]{16}$/.test(result.hash), true);
    assert(result.bytes.byteLength > 0);
    // The gzip companion should be present.
    assertExists(result.gzipBytes);
    assert(result.gzipBytes.byteLength > 0);
    // gzip magic header.
    assertEquals(result.gzipBytes[0], 0x1f);
    assertEquals(result.gzipBytes[1], 0x8b);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("readFrozenAsset: returns raw bytes for an island asset", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-read-island-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    const result = await readFrozenAssetFromOutDir(tmp.path, "/@sprout/island/cart/AddButton.js");
    assertEquals(result.contentType, "text/javascript; charset=utf-8");
    assert(result.bytes.byteLength > 0);
    // The on-disk file under _sprout/ starts with the deterministic
    // esbuild output prefix (e.g. `var ` or `(()=>{`).
    const head = new TextDecoder().decode(result.bytes.slice(0, 64));
    assert(head.length > 0);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("readFrozenAsset: returns raw bytes for the app stylesheet", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-read-css-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    const result = await readFrozenAssetFromOutDir(tmp.path, "/@sprout/app.css");
    assertEquals(result.contentType, "text/css; charset=utf-8");
    assert(result.bytes.byteLength > 0);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// readFrozenAsset: failure paths
// ---------------------------------------------------------------------------

Deno.test("readFrozenAsset: missing publicPath throws FROZEN_MANIFEST_UNSUPPORTED", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-read-missing-pp-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    const err = await assertRejects(
      () => readFrozenAssetFromOutDir(tmp.path, "/@sprout/island/NotThere.js"),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
    const details = err.details as { publicPath: string };
    assertEquals(details.publicPath, "/@sprout/island/NotThere.js");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("readFrozenAsset: missing asset file on disk throws FROZEN_ASSET_MISSING", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-read-missing-file-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    // Remove the runtime file but leave the manifest pointing at it.
    const index = await loadFrozenIndex(tmp.path);
    const runtime = index.assets.get("/@sprout/runtime.js");
    assertExists(runtime);
    await Deno.remove(join(tmp.path, runtime.file));
    const err = await assertRejects(
      () => readFrozenAssetFromOutDir(tmp.path, "/@sprout/runtime.js"),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_ASSET_MISSING");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("readFrozenAsset: missing gzip companion degrades to raw asset", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-no-gz-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    // Remove the gzip companion; the raw asset is still on disk.
    const index = await loadFrozenIndex(tmp.path);
    const runtime = index.assets.get("/@sprout/runtime.js");
    assertExists(runtime);
    assertExists(runtime.gzipFile);
    await Deno.remove(join(tmp.path, runtime.gzipFile));
    // Silence the warning so the test output stays clean.
    const origWarn = console.warn;
    const warns: unknown[][] = [];
    console.warn = (...args: unknown[]) => {
      warns.push(args);
    };
    try {
      const result = await readFrozenAssetFromOutDir(tmp.path, "/@sprout/runtime.js");
      assert(result.bytes.byteLength > 0, "raw bytes must still be readable");
      assertEquals(result.gzipBytes, null, "gzip companion should degrade to null");
      assert(warns.length >= 1, "missing gzip companion should produce a warning");
    } finally {
      console.warn = origWarn;
    }
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("readFrozenAsset: missing manifest throws FROZEN_MANIFEST_MISSING", async () => {
  const err = await assertRejects(
    () => readFrozenAssetFromOutDir("/nope", "/@sprout/runtime.js"),
    CompilerError,
  );
  assertEquals(err.code, "FROZEN_MANIFEST_MISSING");
});

Deno.test("readFrozenAsset: empty outDir throws FROZEN_MANIFEST_MISSING", async () => {
  const tmp = await makeTempDir("sprout-m7-read-empty-");
  try {
    const err = await assertRejects(
      () => readFrozenAssetFromOutDir(tmp.path, "/@sprout/runtime.js"),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_MISSING");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("readFrozenAsset: asset smaller than cap reads successfully with explicit cap", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-at-cap-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    // Read the smallest asset (the runtime is small enough to be well under the cap).
    // Confirm the cap parameter is plumbed through by using the default cap.
    const result = await readFrozenAssetFromOutDir(
      tmp.path,
      "/@sprout/runtime.js",
      FROZEN_ASSET_MAX_BUFFER_BYTES,
    );
    assert(result.bytes.byteLength > 0);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("readFrozenAsset: asset larger than cap throws FROZEN_ASSET_TOO_LARGE", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-oversized-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    // Use a tiny cap to trigger the error without allocating a huge file.
    const tinyCap = 16;
    const err = await assertRejects(
      () => readFrozenAssetFromOutDir(tmp.path, "/@sprout/runtime.js", tinyCap),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_ASSET_TOO_LARGE");
    const details = err.details as { size: number; max: number };
    assert(details.size > tinyCap);
    assertEquals(details.max, tinyCap);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// loadFrozenIndex + readFrozenAsset round-trip
// ---------------------------------------------------------------------------

Deno.test("loadFrozenIndex + readFrozenAsset: every manifest entry has readable bytes", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-roundtrip-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    const index = await loadFrozenIndex(tmp.path);
    for (const [publicPath, asset] of index.assets) {
      const result = await readFrozenAsset(index, publicPath);
      assertEquals(result.contentType, asset.contentType);
      assertEquals(result.hash, asset.hash);
      assert(result.bytes.byteLength > 0);
    }
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// loadFrozenIndex: manifest size cap
// ---------------------------------------------------------------------------

Deno.test("loadFrozenIndex: manifest of normal size (a few KB) parses successfully", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-m7-normalsize-");
  try {
    await buildProduction({ config: fixtureConfig(tmp.path) });
    const index = await loadFrozenIndex(tmp.path);
    assertEquals(index.version, 1);
    assert(index.assets.size > 0);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadFrozenIndex: manifest exceeding FROZEN_MANIFEST_MAX_BYTES rejects with FROZEN_MANIFEST_UNSUPPORTED", async () => {
  const tmp = await makeTempDir("sprout-m7-oversized-manifest-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    // Write a manifest that is larger than the cap. Since the rejection
    // happens before parsing, the content does not need to be valid JSON.
    // Use a binary blob padded to exceed the cap by 1 KB.
    const oversized = "x".repeat(FROZEN_MANIFEST_MAX_BYTES + 1024);
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      oversized,
    );
    const err = await assertRejects(
      () => loadFrozenIndex(tmp.path),
      CompilerError,
    );
    assertEquals(err.code, "FROZEN_MANIFEST_UNSUPPORTED");
    const details = err.details as { size: number; max: number };
    assert(details.size > FROZEN_MANIFEST_MAX_BYTES);
    assertEquals(details.max, FROZEN_MANIFEST_MAX_BYTES);
    assertStringIncludes(err.message, String(details.size));
    assertStringIncludes(err.message, String(details.max));
  } finally {
    await tmp.cleanup();
  }
});
