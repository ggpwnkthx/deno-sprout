// Tests for `@sprout/config`: defaults, shape validation, and path
// resolution. Each test uses its own temp directory so they can run in
// parallel and clean up after themselves.
import {
  assertEquals,
  assertExists,
  assertRejects,
  assertStrictEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import { join } from "@std/path";
import { ConfigError, defineConfig, loadConfig, resolveConfig } from "./mod.ts";
import { makeTempDir, REPO_ROOT, writeFile } from "./_test_utils.ts";

/** Create the default <root>/src/styles/app.css so the default styles.app lookup succeeds. */
async function ensureDefaultStylesheet(root: string): Promise<void> {
  await Deno.mkdir(join(root, "src/styles"), { recursive: true });
  await writeFile(join(root, "src/styles/app.css"), "body {}\n");
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

Deno.test("loadConfig: missing config file resolves to defaults", async () => {
  const tmp = await makeTempDir("sprout-cfg-defaults-");
  try {
    // Create the default stylesheet so the default-path lookup succeeds.
    await Deno.mkdir(join(tmp.path, "src/styles"), { recursive: true });
    await writeFile(join(tmp.path, "src/styles/app.css"), "body {}\n");
    const config = await loadConfig({ root: tmp.path, mode: "development" });
    assertEquals(config.root, tmp.path);
    assertEquals(config.srcDir, join(tmp.path, "src"));
    assertEquals(config.publicDir, join(tmp.path, "public"));
    assertEquals(config.outDir, join(tmp.path, ".sprout/dist"));
    assertEquals(config.routes.dir, join(tmp.path, "src/routes"));
    assertEquals(config.routes.include, ["**/*.{ts,tsx}"]);
    assertEquals(config.routes.exclude, ["**/*.test.{ts,tsx}", "**/_*.{ts,tsx}"]);
    assertEquals(config.islands.dir, join(tmp.path, "src/islands"));
    assertEquals(config.styles.app, join(tmp.path, "src/styles/app.css"));
    assertEquals(config.build.compress, "gzip");
    assertEquals(config.build.sourcemap, true);
    assertEquals(config.build.minify, false);
    assertEquals(config.build.frozenAssetCache, "none");
    assertEquals(config.server.hostname, "0.0.0.0");
    assertEquals(config.server.port, 8000);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: production mode flips minify and sourcemap defaults", async () => {
  const tmp = await makeTempDir("sprout-cfg-prod-");
  try {
    await ensureDefaultStylesheet(tmp.path);
    const config = await loadConfig({ root: tmp.path, mode: "production" });
    assertEquals(config.build.sourcemap, false);
    assertEquals(config.build.minify, true);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

Deno.test("loadConfig: default export is loaded from sprout.config.ts", async () => {
  const tmp = await makeTempDir("sprout-cfg-export-");
  try {
    await ensureDefaultStylesheet(tmp.path);
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { srcDir: "src2" };\n`,
    );
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.srcDir, join(tmp.path, "src2"));
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: defineConfig wrapper is accepted", async () => {
  const tmp = await makeTempDir("sprout-cfg-wrap-");
  try {
    await ensureDefaultStylesheet(tmp.path);
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `import { defineConfig } from "${join(REPO_ROOT, "packages/config/mod.ts")}";
export default defineConfig({ srcDir: "src2" });\n`,
    );
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.srcDir, join(tmp.path, "src2"));
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: named export with no default is rejected", async () => {
  const tmp = await makeTempDir("sprout-cfg-named-");
  try {
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export const config = { srcDir: "src2" };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_IMPORT_FAILED");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: unknown top-level key is rejected in strict mode", async () => {
  const tmp = await makeTempDir("sprout-cfg-unknown-");
  try {
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { srcDir: "src2", whatIsThis: true };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_INVALID_SHAPE");
    assertStringIncludes(err.message, "whatIsThis");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

Deno.test("loadConfig: relative path resolves against root", async () => {
  const tmp = await makeTempDir("sprout-cfg-relpath-");
  try {
    await ensureDefaultStylesheet(tmp.path);
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { outDir: "build" };\n`,
    );
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.outDir, join(tmp.path, "build"));
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: absolute path inside root is accepted", async () => {
  const tmp = await makeTempDir("sprout-cfg-abspath-");
  try {
    await ensureDefaultStylesheet(tmp.path);
    const target = join(tmp.path, "build");
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { outDir: ${JSON.stringify(target)} };\n`,
    );
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.outDir, target);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: absolute path that escapes root is rejected", async () => {
  const root = await makeTempDir("sprout-cfg-escape-");
  const sibling = await makeTempDir("sprout-cfg-sibling-");
  try {
    const configPath = join(root.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { outDir: ${JSON.stringify(sibling.path)} };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: root.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_PATH_OUTSIDE_ROOT");
    assertExists(err.details.path);
  } finally {
    await root.cleanup();
    await sibling.cleanup();
  }
});

Deno.test("loadConfig: relative path that escapes root is rejected", async () => {
  const root = await makeTempDir("sprout-cfg-rel-escape-");
  try {
    const configPath = join(root.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { outDir: "../outside" };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: root.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_PATH_OUTSIDE_ROOT");
  } finally {
    await root.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Port
// ---------------------------------------------------------------------------

Deno.test("loadConfig: port = 0 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-cfg-port0-");
  try {
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { server: { port: 0 }, styles: { app: false } };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: port = 70000 throws CONFIG_INVALID_PORT", async () => {
  const tmp = await makeTempDir("sprout-cfg-port-hi-");
  try {
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { server: { port: 70000 }, styles: { app: false } };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_INVALID_PORT");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Cache policy
// ---------------------------------------------------------------------------

Deno.test("loadConfig: invalid cache kind throws CONFIG_INVALID_CACHE_POLICY", async () => {
  const tmp = await makeTempDir("sprout-cfg-cache-kind-");
  try {
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { build: { frozenAssetCache: { kind: "unbounded" } }, styles: { app: false } };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_INVALID_CACHE_POLICY");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: maxBytes = 0 throws CONFIG_INVALID_CACHE_POLICY", async () => {
  const tmp = await makeTempDir("sprout-cfg-cache-zero-");
  try {
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { build: { frozenAssetCache: { kind: "bounded", maxBytes: 0 } }, styles: { app: false } };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_INVALID_CACHE_POLICY");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: maxBytes = -1 throws CONFIG_INVALID_CACHE_POLICY", async () => {
  const tmp = await makeTempDir("sprout-cfg-cache-neg-");
  try {
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { build: { frozenAssetCache: { kind: "bounded", maxBytes: -1 } }, styles: { app: false } };\n`,
    );
    const err = await assertRejects(
      () => loadConfig({ root: tmp.path }),
      ConfigError,
    );
    assertEquals(err.code, "CONFIG_INVALID_CACHE_POLICY");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("loadConfig: maxBytes unset uses the 16 MiB default", async () => {
  const tmp = await makeTempDir("sprout-cfg-cache-default-");
  try {
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { build: { frozenAssetCache: { kind: "bounded" } }, styles: { app: false } };\n`,
    );
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.build.frozenAssetCache, {
      kind: "bounded",
      maxBytes: 16 * 1024 * 1024,
    });
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Stylesheet
// ---------------------------------------------------------------------------

Deno.test("loadConfig: styles.app points to a missing file throws CONFIG_INVALID_PATH", async () => {
  const tmp = await makeTempDir("sprout-cfg-styles-missing-");
  try {
    const configPath = join(tmp.path, "sprout.config.ts");
    const missing = join(tmp.path, "src/styles/app.css");
    await writeFile(
      configPath,
      `export default { styles: { app: ${JSON.stringify(missing)} } };\n`,
    );
    // An explicit `styles.app` path that doesn't exist on disk is a
    // user typo, not a silent default. loadConfig surfaces it as a
    // typed ConfigError so the operator sees the mistake at startup
    // rather than as a missing-stylesheet at runtime.
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

Deno.test("loadConfig: styles.app points to an existing file is kept", async () => {
  const tmp = await makeTempDir("sprout-cfg-styles-ok-");
  try {
    const stylePath = join(tmp.path, "src/styles/app.css");
    await Deno.mkdir(join(tmp.path, "src/styles"), { recursive: true });
    await writeFile(stylePath, "body { color: black; }\n");
    const configPath = join(tmp.path, "sprout.config.ts");
    await writeFile(
      configPath,
      `export default { styles: { app: ${JSON.stringify(stylePath)} } };\n`,
    );
    const config = await loadConfig({ root: tmp.path });
    assertEquals(config.styles.app, stylePath);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// resolveConfig directly
// ---------------------------------------------------------------------------

Deno.test("resolveConfig: accepts a literal object without touching the filesystem", () => {
  // Pass styles.app = false to avoid the default stylesheet stat check so
  // this test remains pure (no filesystem dependency).
  const resolved = resolveConfig({ srcDir: "src", styles: { app: false } }, {
    root: "/proj",
    mode: "development",
  });
  assertEquals(resolved.root, "/proj");
  assertEquals(resolved.srcDir, "/proj/src");
});

Deno.test("resolveConfig: throws on non-object input", () => {
  assertThrows(
    () => resolveConfig("not an object", { root: "/proj", mode: "development" }),
    ConfigError,
  );
  assertThrows(
    () => resolveConfig(null, { root: "/proj", mode: "development" }),
    ConfigError,
  );
  assertThrows(
    () => resolveConfig(["array"], { root: "/proj", mode: "development" }),
    ConfigError,
  );
});

// ---------------------------------------------------------------------------
// defineConfig is identity
// ---------------------------------------------------------------------------

Deno.test("defineConfig: returns the input unchanged", () => {
  const input = { srcDir: "src2" };
  const out = defineConfig(input);
  assertStrictEquals(out, input);
});
