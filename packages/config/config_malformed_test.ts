// M8 hardening tests for the `@sprout/config` schema.
//
// The config layer is the public trust boundary between the user's
// project and the framework. M8's exit criteria require that every
// malformed input produces a typed `ConfigError` with a stable
// `code`. The tests in this file enumerate the malformed inputs the
// schema documents as "rejected" and assert the typed error.
//
// The tests use `tmp` directories to drop a `sprout.config.ts` and
// call `loadConfig`; this is the same shape `config_test.ts` uses,
// and it lets us exercise the full import / validate pipeline
// instead of just `resolveConfig`.
import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { ConfigError, loadConfig } from "./mod.ts";

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

async function writeConfig(
  root: string,
  body: string,
): Promise<void> {
  await Deno.writeTextFile(join(root, "sprout.config.ts"), body);
}

async function expectConfigError(
  root: string,
  expectedCode:
    | "CONFIG_INVALID_PORT"
    | "CONFIG_INVALID_SHAPE"
    | "CONFIG_INVALID_PATH"
    | "CONFIG_INVALID_CACHE_POLICY"
    | "CONFIG_PATH_OUTSIDE_ROOT"
    | "CONFIG_IMPORT_FAILED",
): Promise<void> {
  const err = await assertRejects(() => loadConfig({ root }), ConfigError);
  assertEquals(err.code, expectedCode);
}

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

Deno.test("M8 config: port = 0 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-m8-port0-");
  try {
    await writeConfig(tmp.path, `export default { server: { port: 0 } };\n`);
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = 65536 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-m8-port65536-");
  try {
    await writeConfig(tmp.path, `export default { server: { port: 65536 } };\n`);
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = 70000 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-m8-port70000-");
  try {
    await writeConfig(tmp.path, `export default { server: { port: 70000 } };\n`);
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = -1 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-m8-portneg-");
  try {
    await writeConfig(tmp.path, `export default { server: { port: -1 } };\n`);
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = 3.14 throws CONFIG_INVALID_PORT", async () => {
  // Non-integer ports are rejected by the `Number.isInteger` check.
  const tmp = await makeTempDir("sprout-m8-portfloat-");
  try {
    await writeConfig(tmp.path, `export default { server: { port: 3.14 } };\n`);
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: port = "8000" throws CONFIG_INVALID_PORT', async () => {
  // String values are rejected by the `typeof value !== "number"` check.
  const tmp = await makeTempDir("sprout-m8-portstr-");
  try {
    await writeConfig(tmp.path, `export default { server: { port: "8000" } };\n`);
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = 1 (boundary) is accepted", async () => {
  // The boundary is "1 to 65535". A port of 1 must be accepted.
  const tmp = await makeTempDir("sprout-m8-port1-");
  try {
    await writeConfig(tmp.path, `export default { server: { port: 1 } };\n`);
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.server.port, 1);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = 65535 (boundary) is accepted", async () => {
  const tmp = await makeTempDir("sprout-m8-portmax-");
  try {
    await writeConfig(tmp.path, `export default { server: { port: 65535 } };\n`);
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.server.port, 65535);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Hostname
// ---------------------------------------------------------------------------

Deno.test('M8 config: hostname = "" throws CONFIG_INVALID_SHAPE', async () => {
  const tmp = await makeTempDir("sprout-m8-hostempty-");
  try {
    await writeConfig(tmp.path, `export default { server: { hostname: "" } };\n`);
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: hostname = 42 (non-string) throws CONFIG_INVALID_SHAPE", async () => {
  const tmp = await makeTempDir("sprout-m8-hostnum-");
  try {
    await writeConfig(tmp.path, `export default { server: { hostname: 42 } };\n`);
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Cache policy
// ---------------------------------------------------------------------------

Deno.test('M8 config: frozenAssetCache.kind = "unbounded" throws CONFIG_INVALID_CACHE_POLICY', async () => {
  const tmp = await makeTempDir("sprout-m8-cunbounded-");
  try {
    await writeConfig(
      tmp.path,
      `export default { build: { frozenAssetCache: { kind: "unbounded" } } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_CACHE_POLICY");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: frozenAssetCache = "always" throws CONFIG_INVALID_SHAPE', async () => {
  // Strings other than "none" are not valid; the loader expects
  // either "none" or an object with kind: "bounded". The schema
  // rejects a non-object with CONFIG_INVALID_SHAPE (the
  // `requireObject` guard fires first) — this is consistent
  // with the other "wrong type" config errors and is the typed
  // error the M8 docs surface.
  const tmp = await makeTempDir("sprout-m8-cstr-");
  try {
    await writeConfig(
      tmp.path,
      `export default { build: { frozenAssetCache: "always" } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: frozenAssetCache.maxBytes = 0 throws CONFIG_INVALID_CACHE_POLICY", async () => {
  const tmp = await makeTempDir("sprout-m8-czero-");
  try {
    await writeConfig(
      tmp.path,
      `export default { build: { frozenAssetCache: { kind: "bounded", maxBytes: 0 } } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_CACHE_POLICY");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: frozenAssetCache.maxBytes = -1 throws CONFIG_INVALID_CACHE_POLICY", async () => {
  const tmp = await makeTempDir("sprout-m8-cneg-");
  try {
    await writeConfig(
      tmp.path,
      `export default { build: { frozenAssetCache: { kind: "bounded", maxBytes: -1 } } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_CACHE_POLICY");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: frozenAssetCache.maxBytes = 1.5 throws CONFIG_INVALID_CACHE_POLICY", async () => {
  // Non-integer maxBytes is rejected by the `Number.isInteger` check.
  const tmp = await makeTempDir("sprout-m8-cfloat-");
  try {
    await writeConfig(
      tmp.path,
      `export default { build: { frozenAssetCache: { kind: "bounded", maxBytes: 1.5 } } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_CACHE_POLICY");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// compress
// ---------------------------------------------------------------------------

Deno.test('M8 config: compress = "br" throws CONFIG_INVALID_PATH', async () => {
  // The current implementation throws CONFIG_INVALID_PATH for
  // unsupported compress values (the M2 spec lists "gzip" / false
  // as the only legal values; "br" is rejected with a shape-like
  // code that the M8 docs surface as the "wrong shape" error).
  const tmp = await makeTempDir("sprout-m8-compressbr-");
  try {
    await writeConfig(tmp.path, `export default { build: { compress: "br" } };\n`);
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    // Pin the code we actually use. The M8 spec says "check
    // load_config.ts" — the implementation throws CONFIG_INVALID_PATH
    // for any non-"gzip" / non-false compress value.
    assertEquals(err.code, "CONFIG_INVALID_PATH");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// include / exclude
// ---------------------------------------------------------------------------

Deno.test("M8 config: routes.include = [] throws CONFIG_INVALID_SHAPE", async () => {
  const tmp = await makeTempDir("sprout-m8-inclempty-");
  try {
    await writeConfig(
      tmp.path,
      `export default { routes: { include: [] } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: routes.include = [42] throws CONFIG_INVALID_SHAPE", async () => {
  const tmp = await makeTempDir("sprout-m8-inctype-");
  try {
    await writeConfig(
      tmp.path,
      `export default { routes: { include: [42] } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: routes.include = [""] throws CONFIG_INVALID_SHAPE', async () => {
  const tmp = await makeTempDir("sprout-m8-incstr-");
  try {
    await writeConfig(
      tmp.path,
      `export default { routes: { include: [""] } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: routes.include = "*.ts" (string instead of array) throws CONFIG_INVALID_SHAPE', async () => {
  const tmp = await makeTempDir("sprout-m8-incstring-");
  try {
    await writeConfig(
      tmp.path,
      `export default { routes: { include: "*.ts" } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Path fields
// ---------------------------------------------------------------------------

Deno.test("M8 config: publicDir = 42 (non-string, non-false) throws CONFIG_INVALID_PATH", async () => {
  const tmp = await makeTempDir("sprout-m8-publicnum-");
  try {
    await writeConfig(
      tmp.path,
      `export default { publicDir: 42 };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_PATH");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: srcDir with a NUL byte throws CONFIG_INVALID_PATH", async () => {
  const tmp = await makeTempDir("sprout-m8-srcdir-nul-");
  try {
    await writeConfig(
      tmp.path,
      `export default { srcDir: "src\\0evil" };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_PATH");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: outDir with a NUL byte throws CONFIG_INVALID_PATH", async () => {
  const tmp = await makeTempDir("sprout-m8-outdir-nul-");
  try {
    await writeConfig(
      tmp.path,
      `export default { outDir: ".sprout\\0evil" };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_PATH");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: srcDir that escapes root throws CONFIG_PATH_OUTSIDE_ROOT", async () => {
  const tmp = await makeTempDir("sprout-m8-srcdir-out-");
  try {
    await writeConfig(
      tmp.path,
      `export default { srcDir: "../outside" };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_PATH_OUTSIDE_ROOT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: publicDir = false is accepted (no public files)", async () => {
  // publicDir: false is the documented opt-out; the loader
  // returns `null` and the asset middleware disables itself.
  const tmp = await makeTempDir("sprout-m8-publicfalse-");
  try {
    await writeConfig(
      tmp.path,
      `export default { publicDir: false };\n`,
    );
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.publicDir, null);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: styles.app = 42 throws CONFIG_INVALID_SHAPE", async () => {
  const tmp = await makeTempDir("sprout-m8-stylesappnum-");
  try {
    await writeConfig(
      tmp.path,
      `export default { styles: { app: 42 } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: styles.app = false is accepted (no global stylesheet)", async () => {
  const tmp = await makeTempDir("sprout-m8-stylesappfalse-");
  try {
    await writeConfig(
      tmp.path,
      `export default { styles: { app: false } };\n`,
    );
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.styles.app, null);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Top-level shape
// ---------------------------------------------------------------------------

Deno.test("M8 config: default export = an array throws CONFIG_INVALID_SHAPE", async () => {
  const tmp = await makeTempDir("sprout-m8-defaultarr-");
  try {
    await writeConfig(
      tmp.path,
      `export default [1, 2, 3];\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: default export = a number throws CONFIG_INVALID_SHAPE", async () => {
  const tmp = await makeTempDir("sprout-m8-defaultnum-");
  try {
    await writeConfig(
      tmp.path,
      `export default 42;\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: default export = a string throws CONFIG_INVALID_SHAPE", async () => {
  const tmp = await makeTempDir("sprout-m8-defaultstr-");
  try {
    await writeConfig(
      tmp.path,
      `export default "hello";\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: unknown top-level key throws CONFIG_INVALID_SHAPE with details.key", async () => {
  const tmp = await makeTempDir("sprout-m8-unknown-");
  try {
    await writeConfig(
      tmp.path,
      `export default { foo: 1 };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_INVALID_SHAPE");
    const details = err.details as { key?: string };
    assertEquals(details.key, "foo");
    assertStringIncludes(err.message, "foo");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: unknown nested key in routes throws CONFIG_INVALID_SHAPE with details.key", async () => {
  const tmp = await makeTempDir("sprout-m8-unknownnested-");
  try {
    await writeConfig(
      tmp.path,
      `export default { routes: { extra: true } };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_INVALID_SHAPE");
    const details = err.details as { key?: string; parent?: string };
    assertEquals(details.key, "extra");
    assertEquals(details.parent, "routes");
  } finally {
    await tmp.cleanup();
  }
});
