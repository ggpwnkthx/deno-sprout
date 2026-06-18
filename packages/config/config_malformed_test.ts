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
import { join } from "@std/path";
import { ConfigError, loadConfig } from "./mod.ts";
import { expectConfigError, makeTempDir, writeConfig } from "./_test_utils.ts";

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

Deno.test("M8 config: port = 0 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-m8-port0-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { port: 0 }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = 65536 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-m8-port65536-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { port: 65536 }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = 70000 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-m8-port70000-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { port: 70000 }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = -1 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-m8-portneg-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { port: -1 }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = 3.14 throws CONFIG_INVALID_PORT", async () => {
  // Non-integer ports are rejected by the `Number.isInteger` check.
  const tmp = await makeTempDir("sprout-m8-portfloat-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { port: 3.14 }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: port = "8000" throws CONFIG_INVALID_PORT', async () => {
  // String values are rejected by the `typeof value !== "number"` check.
  const tmp = await makeTempDir("sprout-m8-portstr-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { port: "8000" }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: port = 1 (boundary) is accepted", async () => {
  // The boundary is "1 to 65535". A port of 1 must be accepted.
  const tmp = await makeTempDir("sprout-m8-port1-");
  try {
    await Deno.mkdir(join(tmp.path, "src/styles"), { recursive: true });
    await Deno.writeTextFile(join(tmp.path, "src/styles/app.css"), "body{}\n");
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
    await Deno.mkdir(join(tmp.path, "src/styles"), { recursive: true });
    await Deno.writeTextFile(join(tmp.path, "src/styles/app.css"), "body{}\n");
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

Deno.test('M8 config: hostname = "" throws CONFIG_INVALID_HOSTNAME', async () => {
  const tmp = await makeTempDir("sprout-m8-hostempty-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { hostname: "" }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_HOSTNAME");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: hostname = 42 (non-string) throws CONFIG_INVALID_HOSTNAME", async () => {
  const tmp = await makeTempDir("sprout-m8-hostnum-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { hostname: 42 }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_HOSTNAME");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Hostname (continued)
// ---------------------------------------------------------------------------

Deno.test("M8 config: hostname with leading whitespace throws CONFIG_INVALID_HOSTNAME", async () => {
  const tmp = await makeTempDir("sprout-m8-hostwslead-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { hostname: " 0.0.0.0" }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_HOSTNAME");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: hostname with trailing newline throws CONFIG_INVALID_HOSTNAME", async () => {
  const tmp = await makeTempDir("sprout-m8-hostwstrail-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { hostname: "0.0.0.0\\n" }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_HOSTNAME");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 config: hostname with NUL byte throws CONFIG_INVALID_HOSTNAME", async () => {
  const tmp = await makeTempDir("sprout-m8-hostnul-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { hostname: "0.0.0.0\\0" }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_HOSTNAME");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: hostname = "localhost" is accepted (special literal)', async () => {
  const tmp = await makeTempDir("sprout-m8-hostlocal-");
  try {
    await Deno.mkdir(join(tmp.path, "src/styles"), { recursive: true });
    await Deno.writeTextFile(join(tmp.path, "src/styles/app.css"), "body{}\n");
    await writeConfig(tmp.path, `export default { server: { hostname: "localhost" } };\n`);
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.server.hostname, "localhost");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: hostname = "127.0.0.1" (IPv4) is accepted', async () => {
  const tmp = await makeTempDir("sprout-m8-hostipv4-");
  try {
    await Deno.mkdir(join(tmp.path, "src/styles"), { recursive: true });
    await Deno.writeTextFile(join(tmp.path, "src/styles/app.css"), "body{}\n");
    await writeConfig(tmp.path, `export default { server: { hostname: "127.0.0.1" } };\n`);
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.server.hostname, "127.0.0.1");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: hostname = "[::1]" (bracketed IPv6) is accepted', async () => {
  const tmp = await makeTempDir("sprout-m8-hostipv6-");
  try {
    await Deno.mkdir(join(tmp.path, "src/styles"), { recursive: true });
    await Deno.writeTextFile(join(tmp.path, "src/styles/app.css"), "body{}\n");
    await writeConfig(tmp.path, `export default { server: { hostname: "[::1]" } };\n`);
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.server.hostname, "[::1]");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: hostname = "[::]" (IPv6 all-zeros) is accepted', async () => {
  const tmp = await makeTempDir("sprout-m8-hostipv6zeros-");
  try {
    await Deno.mkdir(join(tmp.path, "src/styles"), { recursive: true });
    await Deno.writeTextFile(join(tmp.path, "src/styles/app.css"), "body{}\n");
    await writeConfig(tmp.path, `export default { server: { hostname: "[::]" } };\n`);
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.server.hostname, "[::]");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: hostname = "my-app.local" (hostname) is accepted', async () => {
  const tmp = await makeTempDir("sprout-m8-hostdns-");
  try {
    await Deno.mkdir(join(tmp.path, "src/styles"), { recursive: true });
    await Deno.writeTextFile(join(tmp.path, "src/styles/app.css"), "body{}\n");
    await writeConfig(tmp.path, `export default { server: { hostname: "my-app.local" } };\n`);
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.server.hostname, "my-app.local");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: hostname = "not a hostname" (whitespace inside) throws CONFIG_INVALID_HOSTNAME', async () => {
  const tmp = await makeTempDir("sprout-m8-hostwsinside-");
  try {
    await writeConfig(
      tmp.path,
      `export default { server: { hostname: "not a hostname" }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_HOSTNAME");
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
      `export default { build: { frozenAssetCache: { kind: "unbounded" } }, styles: { app: false } };\n`,
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
      `export default { build: { frozenAssetCache: "always" }, styles: { app: false } };\n`,
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
      `export default { build: { frozenAssetCache: { kind: "bounded", maxBytes: 0 } }, styles: { app: false } };\n`,
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
      `export default { build: { frozenAssetCache: { kind: "bounded", maxBytes: -1 } }, styles: { app: false } };\n`,
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
      `export default { build: { frozenAssetCache: { kind: "bounded", maxBytes: 1.5 } }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_CACHE_POLICY");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// compress
// ---------------------------------------------------------------------------

Deno.test('M8 config: compress = "br" throws CONFIG_INVALID_SHAPE', async () => {
  const tmp = await makeTempDir("sprout-m8-compressbr-");
  try {
    await writeConfig(
      tmp.path,
      `export default { build: { compress: "br" }, styles: { app: false } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
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

Deno.test('M8 config: routes.include = ["**/*.ts\0"] throws CONFIG_INVALID_SHAPE', async () => {
  const tmp = await makeTempDir("sprout-m8-inc-nul-");
  try {
    await writeConfig(
      tmp.path,
      `export default { routes: { include: ["**/*.ts\0"] } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test('M8 config: islands.exclude = ["**/*.server.ts\0"] throws CONFIG_INVALID_SHAPE', async () => {
  const tmp = await makeTempDir("sprout-m8-exc-nul-");
  try {
    await writeConfig(
      tmp.path,
      `export default { islands: { exclude: ["**/*.server.ts\0"] } };\n`,
    );
    await expectConfigError(tmp.path, "CONFIG_INVALID_SHAPE");
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
      `export default { publicDir: false, styles: { app: false } };\n`,
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

Deno.test("M8 config: default styles.app (<root>/src/styles/app.css) missing throws CONFIG_INVALID_PATH", async () => {
  // When styles.app is undefined the loader falls back to the default
  // path. A missing stylesheet at that path is a startup error (not a
  // silent opt-out like styles.app = false).
  const tmp = await makeTempDir("sprout-m8-stylesappdefaultmissing-");
  try {
    // No config file, no stylesheet — loadConfig uses all defaults.
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_INVALID_PATH");
    assertStringIncludes(err.message, "styles.app");
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
