// M8 hardening tests for `@sprout/compiler` path validation.
//
// The compiler is the layer that maps source files to manifest
// entries and frozen-manifest public paths. M8's "Reject NUL bytes
// in paths" and "Reject path traversal in public asset URLs" rules
// land here in two ways:
//
//   1. The path-to-pattern helpers (`routeFileToPattern`,
//      `islandFileToPublicPath`) reject dot-segments and NUL bytes
//      on the source side.
//   2. The frozen manifest loader (`loadFrozenIndex`) rejects
//      dot-segments and NUL bytes on the manifest side (defense
//      in depth — a tampered manifest must not smuggle a `..` into
//      a served public path or a `_sprout/../foo.js` into a
//      served file path).
//
// `readFrozenAsset` itself does not validate publicPath; the
// validation happens upstream in `loadFrozenIndex`, which is the
// only path that constructs a `FrozenIndex`. The asset reader
// therefore fails with `FROZEN_MANIFEST_UNSUPPORTED` for unknown
// public paths (covered in `frozen_reader_test.ts`).
import { assertEquals, assertRejects, assertThrows } from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { CompilerError, islandFileToPublicPath, routeFileToPattern } from "./mod.ts";
import { loadFrozenIndex } from "./build/frozen_index.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const TMP_ROOT = join(REPO_ROOT, "tests/.tmp");

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

// ---------------------------------------------------------------------------
// routeFileToPattern
// ---------------------------------------------------------------------------

Deno.test("M8 compiler: routeFileToPattern returns null for NUL bytes", () => {
  // The function never throws; NUL bytes cause the caller to
  // drop the file as "not a route".
  assertEquals(routeFileToPattern("a\0b"), null);
  assertEquals(routeFileToPattern("\0"), null);
  assertEquals(routeFileToPattern("/\0evil"), null);
});

Deno.test("M8 compiler: routeFileToPattern returns null for dot-segments", () => {
  // A file at `../foo` (after slash-normalization) cannot be a
  // route; the helper returns null.
  assertEquals(routeFileToPattern("../foo"), null);
  assertEquals(routeFileToPattern("a/../b"), null);
  assertEquals(routeFileToPattern("./foo"), null);
  assertEquals(routeFileToPattern("a/./b"), null);
});

// ---------------------------------------------------------------------------
// islandFileToPublicPath
// ---------------------------------------------------------------------------

Deno.test("M8 compiler: islandFileToPublicPath rejects NUL bytes", () => {
  let caught: unknown;
  try {
    islandFileToPublicPath("a\0b");
  } catch (e) {
    caught = e;
  }
  assertThrows(() => {
    throw caught;
  }, CompilerError);
  assertEquals((caught as CompilerError).code, "MANIFEST_INVALID_PUBLIC_PATH");
});

Deno.test("M8 compiler: islandFileToPublicPath rejects dot-segments", () => {
  let caught: unknown;
  try {
    islandFileToPublicPath("../foo");
  } catch (e) {
    caught = e;
  }
  assertEquals((caught as CompilerError).code, "MANIFEST_INVALID_PUBLIC_PATH");
});

Deno.test("M8 compiler: islandFileToPublicPath rejects empty segments", () => {
  // A double-slash or trailing-slash produces an empty
  // segment; the helper rejects it.
  let caught: unknown;
  try {
    islandFileToPublicPath("a//b");
  } catch (e) {
    caught = e;
  }
  assertEquals((caught as CompilerError).code, "MANIFEST_INVALID_PUBLIC_PATH");
});

// ---------------------------------------------------------------------------
// loadFrozenIndex: path validation
// ---------------------------------------------------------------------------

Deno.test("M8 compiler: loadFrozenIndex rejects publicPath with ..", async () => {
  const tmp = await makeTempDir("sprout-m8-frozen-pp-dotdot-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      JSON.stringify({
        version: 1,
        assets: [{
          kind: "runtime",
          id: "runtime",
          publicPath: "/@sprout/island/../evil.js",
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
    const details = err.details as { publicPath?: string };
    assertEquals(details.publicPath, "/@sprout/island/../evil.js");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 compiler: loadFrozenIndex rejects publicPath with NUL byte", async () => {
  const tmp = await makeTempDir("sprout-m8-frozen-pp-nul-");
  try {
    await Deno.mkdir(tmp.path, { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "sprout.manifest.json"),
      JSON.stringify({
        version: 1,
        assets: [{
          kind: "runtime",
          id: "runtime",
          publicPath: "/@sprout/runtime\0.js",
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

Deno.test("M8 compiler: loadFrozenIndex rejects file with .. (escapes _sprout/)", async () => {
  // A file path of `_sprout/../etc.js` is slash-normalized to
  // itself, but the strict `RELATIVE_FILE_RE` test fires first:
  // the path does not start with `_sprout/`, so the loader
  // rejects it with FROZEN_MANIFEST_UNSUPPORTED.
  const tmp = await makeTempDir("sprout-m8-frozen-file-dotdot-");
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
          file: "_sprout/../etc.0123456789abcdef.js",
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

Deno.test("M8 compiler: loadFrozenIndex rejects file with NUL byte", async () => {
  const tmp = await makeTempDir("sprout-m8-frozen-file-nul-");
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
          file: "_sprout/runtime\0.0123456789abcdef.js",
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

Deno.test("M8 compiler: loadFrozenIndex rejects gzipFile with ..", async () => {
  const tmp = await makeTempDir("sprout-m8-frozen-gz-dotdot-");
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
          file: "_sprout/runtime.0123456789abcdef.js",
          contentType: "text/javascript; charset=utf-8",
          hash: "0123456789abcdef",
          gzipFile: "_sprout/../etc.0011223344556677.js.gz",
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
