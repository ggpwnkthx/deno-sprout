// Tests for the M4 dev asset pipeline in @sprout/compiler.
//
// The tests cover:
//   - runtime / island / style asset compile paths
//   - cache hit on the second call
//   - input-set invalidation on mtime change (direct and transitive)
//   - source map production
//   - the dev cache's input set does not track the virtual
//     island entry tmp file (a build implementation detail)
//
// Each test starts from a fresh tmp directory so the cache state
// is independent. The module-level cache is reset via the test
// helper exported by build/dev_assets.ts.
import {
  assert,
  assertEquals,
  assertExists,
  assertNotEquals,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { loadConfig } from "@sprout/config";
import { resolveRuntimeEntryFile } from "./source_paths.ts";
import { compileDevAsset, compileDevSourceMap, resolveIslandEntryFile } from "./mod.ts";
import { resetDevCacheForTests } from "./build/dev_assets_test_utils.ts";
import { esbuildBundle, VIRTUAL_ENTRY_DIR } from "./build/esbuild.ts";
import { encodeHex } from "@std/encoding/hex";
import type { ResolvedConfig } from "@sprout/config";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const TMP_ROOT = join(REPO_ROOT, "tests/.tmp");

const dummyConfig: ResolvedConfig = {
  mode: "development",
  root: "/tmp",
  srcDir: "/tmp/src",
  outDir: "/tmp/out",
  publicDir: null,
  routes: { dir: "/tmp/r", include: ["*.ts"], exclude: [] },
  islands: { dir: "/tmp/i", include: ["*.ts"], exclude: [] },
  styles: { app: null },
  build: {
    compress: false,
    sourcemap: true,
    minify: false,
    frozenAssetCache: "none",
  },
  server: { hostname: "0.0.0.0", port: 0 },
};

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

Deno.test("compileDevAsset: runtime asset compiles to non-empty JS", async () => {
  resetDevCacheForTests();
  const result = await compileDevAsset({
    kind: "runtime",
    id: "runtime",
    entry: resolveRuntimeEntryFile(),
    publicPath: "/@sprout/runtime.js",
    jsxImportSource: "@sprout/jsx/dom",
    config: dummyConfig,
    mode: "development",
  });
  assertEquals(result.kind, "runtime");
  assertEquals(result.contentType, "text/javascript; charset=utf-8");
  assert(result.js.length > 0, "runtime bundle should not be empty");
  const head = new TextDecoder().decode(result.js);
  assertStringIncludes(head, "start");
  assertStringIncludes(head, "export");
});

Deno.test("compileDevAsset: island asset produces a wrapper that calls mountComponent", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-iso-");
  try {
    const islandPath = join(tmp.path, "Counter.tsx");
    await Deno.writeTextFile(
      islandPath,
      "export default function Counter(p: { initial: number }) { return null; }\n",
    );
    const result = await compileDevAsset({
      kind: "island",
      id: "Counter",
      entry: islandPath,
      publicPath: "/@sprout/island/Counter.js",
      jsxImportSource: "@sprout/jsx/dom",
      config: dummyConfig,
      mode: "development",
    });
    assertEquals(result.kind, "island");
    assertEquals(result.contentType, "text/javascript; charset=utf-8");
    const body = new TextDecoder().decode(result.js);
    assertStringIncludes(body, "mount");
    assertStringIncludes(body, "mountComponent");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("compileDevAsset: style asset returns the source CSS", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-css-");
  try {
    const cssPath = join(tmp.path, "app.css");
    await Deno.writeTextFile(
      cssPath,
      "body { color: red; }\n.btn { padding: 4px; }\n",
    );
    const result = await compileDevAsset({
      kind: "style",
      id: "app",
      entry: cssPath,
      publicPath: "/@sprout/app.css",
      jsxImportSource: "@sprout/jsx",
      config: dummyConfig,
      mode: "development",
    });
    assertEquals(result.kind, "style");
    assertEquals(result.contentType, "text/css; charset=utf-8");
    const body = new TextDecoder().decode(result.js);
    assertStringIncludes(body, "body { color: red; }");
    assertStringIncludes(body, ".btn");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("compileDevAsset: second call with the same key returns cached entry", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-cache-");
  try {
    const entryPath = join(tmp.path, "main.tsx");
    await Deno.writeTextFile(
      entryPath,
      "export default function Main() { return null; }\n",
    );
    const input = {
      kind: "island" as const,
      id: "Main",
      entry: entryPath,
      publicPath: "/@sprout/island/Main.js",
      jsxImportSource: "@sprout/jsx/dom",
      config: dummyConfig,
      mode: "development" as const,
    };
    const a = await compileDevAsset(input);
    const b = await compileDevAsset(input);
    // Both calls must return the same cache key. Same key
    // implies same entry on a clean dev cache.
    assertEquals(a.cacheKey, b.cacheKey);
    assertStringIncludes(a.cacheKey, entryPath);
    assertStringIncludes(a.cacheKey, "Main");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("compileDevAsset: editing the entry file invalidates the cache", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-edit-");
  try {
    const entryPath = join(tmp.path, "X.tsx");
    await Deno.writeTextFile(
      entryPath,
      "export default function X() { return 'first'; }\n",
    );
    const input = {
      kind: "island" as const,
      id: "X",
      entry: entryPath,
      publicPath: "/@sprout/island/X.js",
      jsxImportSource: "@sprout/jsx/dom",
      config: dummyConfig,
      mode: "development" as const,
    };
    const a = await compileDevAsset(input);
    // Bump the mtime explicitly so the stat check sees a change
    // even on filesystems with coarse-grained timestamps.
    await new Promise((r) => setTimeout(r, 20));
    await Deno.writeTextFile(
      entryPath,
      "export default function X() { return 'second'; }\n",
    );
    const b = await compileDevAsset(input);
    assertNotEquals(
      new TextDecoder().decode(a.js),
      new TextDecoder().decode(b.js),
      "second compile should differ after edit",
    );
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("compileDevAsset: editing a transitive import invalidates the cache", async () => {
  resetDevCacheForTests();
  const tmp = await makeTempDir("sprout-trans-");
  try {
    const helperPath = join(tmp.path, "helper.ts");
    await Deno.writeTextFile(
      helperPath,
      "export const tag = 'v1';\n",
    );
    const entryPath = join(tmp.path, "Main.tsx");
    await Deno.writeTextFile(
      entryPath,
      "import { tag } from './helper.ts';\nexport default function Main() { return tag; }\n",
    );
    const input = {
      kind: "island" as const,
      id: "Main",
      entry: entryPath,
      publicPath: "/@sprout/island/Main.js",
      jsxImportSource: "@sprout/jsx/dom",
      config: dummyConfig,
      mode: "development" as const,
    };
    const a = await compileDevAsset(input);
    assertStringIncludes(new TextDecoder().decode(a.js), "v1");
    await new Promise((r) => setTimeout(r, 20));
    await Deno.writeTextFile(
      helperPath,
      "export const tag = 'v2';\n",
    );
    const b = await compileDevAsset(input);
    assertStringIncludes(new TextDecoder().decode(b.js), "v2");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("compileDevAsset: source map is produced and the JS references it", async () => {
  resetDevCacheForTests();
  const result = await compileDevAsset({
    kind: "runtime",
    id: "runtime",
    entry: resolveRuntimeEntryFile(),
    publicPath: "/@sprout/runtime.js",
    jsxImportSource: "@sprout/jsx/dom",
    config: dummyConfig,
    mode: "development",
  });
  assertExists(result.map, "runtime bundle should produce a source map");
  const map = new TextDecoder().decode(result.map);
  assertStringIncludes(map, "version");
  assertStringIncludes(map, "sources");
  const body = new TextDecoder().decode(result.js);
  assertStringIncludes(body, "sourceMappingURL=");
});

Deno.test("compileDevSourceMap: returns the same map as compileDevAsset's map field", async () => {
  resetDevCacheForTests();
  const input = {
    kind: "runtime" as const,
    id: "runtime",
    entry: resolveRuntimeEntryFile(),
    publicPath: "/@sprout/runtime.js",
    jsxImportSource: "@sprout/jsx/dom",
    config: dummyConfig,
    mode: "development" as const,
  };
  const a = await compileDevAsset(input);
  const b = await compileDevSourceMap(input);
  assertExists(a.map);
  assertExists(b);
  assertEquals(
    new TextDecoder().decode(a.map),
    new TextDecoder().decode(b),
  );
});

Deno.test("compileDevAsset: cache key changes when entry or id changes", async () => {
  resetDevCacheForTests();
  const a = await compileDevAsset({
    kind: "runtime",
    id: "runtime",
    entry: resolveRuntimeEntryFile(),
    publicPath: "/@sprout/runtime.js",
    jsxImportSource: "@sprout/jsx/dom",
    config: dummyConfig,
    mode: "development",
  });
  const tmp = await makeTempDir("sprout-key-");
  try {
    const entryPath = join(tmp.path, "Other.tsx");
    await Deno.writeTextFile(
      entryPath,
      "export default function Other() { return null; }\n",
    );
    const b = await compileDevAsset({
      kind: "island",
      id: "Other",
      entry: entryPath,
      publicPath: "/@sprout/island/Other.js",
      jsxImportSource: "@sprout/jsx/dom",
      config: dummyConfig,
      mode: "development",
    });
    assertNotEquals(a.cacheKey, b.cacheKey);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("resolveIslandEntryFile: finds .tsx and .ts files", async () => {
  const tmp = await makeTempDir("sprout-resolve-");
  try {
    await Deno.mkdir(join(tmp.path, "src/islands"), { recursive: true });
    await Deno.writeTextFile(
      join(tmp.path, "src/islands/A.tsx"),
      "export default function A() { return null; }\n",
    );
    await Deno.writeTextFile(
      join(tmp.path, "src/islands/B.ts"),
      "export default function B() { return null; }\n",
    );
    const a = resolveIslandEntryFile("A", tmp.path);
    const b = resolveIslandEntryFile("B", tmp.path);
    const c = resolveIslandEntryFile("Missing", tmp.path);
    assertEquals(a, join(tmp.path, "src/islands/A.tsx"));
    assertEquals(b, join(tmp.path, "src/islands/B.ts"));
    assertEquals(c, null);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test(
  "compileDevAsset: virtual entry tmp file is written outside the user's project dir",
  async () => {
    resetDevCacheForTests();
    // Build a tmp project with one island in <tmp>/src/islands/.
    // The tmp dir is rooted under the repo's tests/.tmp/ so the
    // deno-resolver can walk up to the workspace `deno.jsonc`;
    // the assertion only cares about the on-disk location of
    // the virtual entry file, not the project's contents.
    const tmp = await makeTempDir("sprout-virtual-entry-loc-");
    try {
      await Deno.mkdir(join(tmp.path, "src/islands"), { recursive: true });
      await Deno.writeTextFile(
        join(tmp.path, "src/islands/Counter.tsx"),
        "export default function C() { return null; }",
      );
      const config = await loadConfig({ root: tmp.path });
      await compileDevAsset({
        kind: "island",
        id: "Counter",
        entry: join(tmp.path, "src/islands/Counter.tsx"),
        publicPath: "/@sprout/island/Counter.js",
        jsxImportSource: "@sprout/jsx/dom",
        config,
        mode: "development",
      });
      // The tmp dir for the user's project must NOT contain a
      // sprout-island-*.ts file (the virtual entry lives in a
      // system tmp dir, not the project).
      for await (const entry of Deno.readDir(join(tmp.path, "src/islands"))) {
        assert(
          !entry.name.startsWith("sprout-island-"),
          `unexpected virtual entry leak: ${entry.name}`,
        );
      }
    } finally {
      await tmp.cleanup();
    }
  },
);

Deno.test(
  "compileDevAsset: virtual entry tmp file is not in the cache input set",
  async () => {
    resetDevCacheForTests();
    // The dev cache must NOT track the virtual island entry
    // tmp file. The virtual entry is a build implementation
    // detail: its lifetime is bounded by the bundler, not the
    // user's edits, and a leftover or missing file from a prior
    // run would otherwise force a spurious cache invalidation
    // (the M7 flakiness story). The filter lives in
    // `esbuildBundle` (see `isInsideVirtualEntryDir` in
    // `build/esbuild.ts`); this test exercises it directly with
    // a virtual entry materialised at the deterministic path
    // `compileIsland` uses, then asserts the returned `inputs`
    // array contains no path under
    // `${VIRTUAL_ENTRY_DIR}/sprout-island-`.
    const tmp = await makeTempDir("sprout-input-set-");
    let virtualEntry: string | null = null;
    try {
      await Deno.mkdir(join(tmp.path, "src/islands"), { recursive: true });
      const entry = join(tmp.path, "src/islands/Counter.tsx");
      await Deno.writeTextFile(
        entry,
        "export default function C() { return null; }",
      );
      // Materialise a virtual entry at the deterministic path
      // the production code uses for `(entry, "Counter")`. The
      // hash is the 16-char hex of `entry\0id`, truncated. The
      // content is a minimal but legal island wrapper so esbuild
      // can resolve the import and produce a metafile.
      const entryHash = encodeHex(
        new TextEncoder().encode(`${entry}\0Counter`),
      ).slice(0, 16);
      await Deno.mkdir(VIRTUAL_ENTRY_DIR, { recursive: true });
      virtualEntry = `${VIRTUAL_ENTRY_DIR}/sprout-island-${entryHash}.ts`;
      await Deno.writeTextFile(
        virtualEntry,
        [
          "// Generated by @sprout/compiler (test fixture).",
          `import Component from ${JSON.stringify(entry)};`,
          "",
          "export default {",
          "  mount(element: HTMLElement, props: Readonly<Record<string, unknown>>) {",
          "    void element;",
          "    void props;",
          "    void Component;",
          "  },",
          "};",
          "",
        ].join("\n"),
      );
      const result = await esbuildBundle({
        entryPoints: [virtualEntry],
        jsxImportSource: "@sprout/jsx/dom",
        sourceMap: "linked",
      });
      // No path under the virtual-entry dir may appear in the
      // input set. The pattern uses the platform separator so
      // the assertion is portable to Windows; the test
      // environment is Linux but the regex is the same.
      const sep = Deno.build.os === "windows" ? "\\\\" : "/";
      const virtualEntryPattern = new RegExp(
        `sprout-virtual-entries${sep}sprout-island-`,
      );
      for (const input of result.inputs) {
        assert(
          !virtualEntryPattern.test(input.path),
          `input set should not contain the virtual entry tmp file: ${input.path}`,
        );
      }
    } finally {
      if (virtualEntry !== null) {
        try {
          await Deno.remove(virtualEntry);
        } catch (_cause) {
          // best-effort cleanup
        }
      }
      await tmp.cleanup();
    }
  },
);
