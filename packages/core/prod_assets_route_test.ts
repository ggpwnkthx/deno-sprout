// End-to-end tests for the M7 production asset routes on
// `@sprout/core`.
//
// The tests build a tmp project from the basic-app fixture,
// run `buildProduction`, and then build a production-mode App
// against the same fixture. They cover the M7 spec exit
// criteria for the serve layer:
//
//   1. `sprout serve` serves production assets from the frozen
//      manifest (GET /@sprout/runtime.js, /@sprout/app.css,
//      /@sprout/island/Counter.js, ...).
//   2. `If-None-Match` returns 304.
//   3. `gzip;q=0` does not receive gzip.
//   4. Startup does not load all asset bytes (proven by
//      wrapping `Deno.readFile` and counting calls to
//      `<outDir>/_sprout/` before any request is made).
//
// The bounded LRU behavior is exercised in a separate test
// that configures `build.frozenAssetCache: { kind: "bounded",
// maxBytes: 100 }` and asserts the cap is honored.
//
// The public-file behavior is also asserted: a GET to
// /favicon.svg in production mode returns the same
// `cache-control: public, max-age=3600` as in dev mode.
import { assert, assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@1";
import { copy } from "jsr:@std/fs@1/copy";
import { fromFileUrl, join } from "@std/path";
import { buildProduction } from "@sprout/compiler";
import type { ResolvedConfig } from "@sprout/config";
import { createApp } from "./mod.ts";
import type { App } from "./mod.ts";
import { resetDevCacheForTests } from "../compiler/build/dev_assets_test_utils.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const FIXTURE = join(REPO_ROOT, "tests/fixtures/basic-app");
const TMP_ROOT = join(REPO_ROOT, "tests/.tmp");

/**
 * Copy the basic-app fixture (excluding the dist / .sprout
 * directories) to a fresh tmp dir and write a `sprout.config.ts`
 * that points `outDir` at a sibling `out/` directory. The CLI
 * runs against the copy. We override the config so the build
 * output is co-located with the copied project.
 */
async function copyFixtureTo(target: string): Promise<void> {
  await copy(FIXTURE, target, {
    overwrite: true,
  });
  // The copied fixture has the canonical `sprout.config.ts`
  // (root: "."). Override `outDir` to a sibling path so the
  // build does not pollute the source dir.
  const outDir = join(target, ".sprout/dist");
  const config = `export default { root: ".", outDir: ".sprout/dist" };\n`;
  await Deno.writeTextFile(join(target, "sprout.config.ts"), config);
  // Suppress the unused-binding lint: `outDir` is documented in
  // the config string above.
  void outDir;
}

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

async function buildProjectAt(
  root: string,
  overrides?: {
    readonly frozenAssetCache?: ResolvedConfig["build"]["frozenAssetCache"];
  },
): Promise<void> {
  resetDevCacheForTests();
  // Load the resolved config (production mode) for the
  // copied fixture.
  const configMod = await import("@sprout/config");
  const cfg = await configMod.loadConfig({ root, mode: "production" });
  const finalCfg: ResolvedConfig = overrides === undefined ? cfg : {
    ...cfg,
    build: { ...cfg.build, frozenAssetCache: overrides.frozenAssetCache! },
  };
  await buildProduction({ config: finalCfg });
}

async function bootProductionApp(root: string): Promise<App> {
  return await createApp({ root, mode: "production" });
}

// ---------------------------------------------------------------------------
// serveFrozenAsset end-to-end
// ---------------------------------------------------------------------------

Deno.test("prod asset: GET /@sprout/runtime.js returns 200, etag, immutable cache, nosniff", async () => {
  const tmp = await makeTempDir("sprout-m7-runtime-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(new Request("http://0.0.0.0/@sprout/runtime.js"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/javascript; charset=utf-8");
    assertEquals(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const etag = res.headers.get("etag");
    assertExists(etag);
    assert(etag.startsWith('"') && etag.endsWith('"'), `ETag should be quoted, got ${etag}`);
    const body = await res.text();
    assert(body.length > 0);
    assertStringIncludes(body, "start");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: GET /@sprout/runtime.js with If-None-Match returns 304", async () => {
  const tmp = await makeTempDir("sprout-m7-etag-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    // First request: discover the ETag.
    const first = await app.fetch(new Request("http://0.0.0.0/@sprout/runtime.js"));
    const etag = first.headers.get("etag");
    assertExists(etag);
    // Second request with If-None-Match -> 304.
    const second = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js", {
        headers: { "if-none-match": etag },
      }),
    );
    assertEquals(second.status, 304);
    assertEquals(second.headers.get("etag"), etag);
    assertEquals(second.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assertEquals(second.headers.get("x-content-type-options"), "nosniff");
    const body = await second.text();
    assertEquals(body, "");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: If-None-Match: * returns 304", async () => {
  const tmp = await makeTempDir("sprout-m7-etagstar-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js", {
        headers: { "if-none-match": "*" },
      }),
    );
    assertEquals(res.status, 304);
    assertEquals(
      res.headers.get("etag"),
      '"' + (await firstEtag(app, "/@sprout/runtime.js")) + '"',
    );
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: If-None-Match with a wrong value returns 200", async () => {
  const tmp = await makeTempDir("sprout-m7-etagwrong-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js", {
        headers: { "if-none-match": '"deadbeefdeadbeef"' },
      }),
    );
    assertEquals(res.status, 200);
    const body = await res.text();
    assert(body.length > 0);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: Accept-Encoding: gzip returns the gzip companion with content-encoding: gzip", async () => {
  const tmp = await makeTempDir("sprout-m7-gzip-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js", {
        headers: { "accept-encoding": "gzip" },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-encoding"), "gzip");
    assertEquals(res.headers.get("vary"), "accept-encoding");
    const body = new Uint8Array(await res.arrayBuffer());
    // Gzip magic header.
    assertEquals(body[0], 0x1f);
    assertEquals(body[1], 0x8b);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: Accept-Encoding: gzip;q=0 does not receive gzip", async () => {
  const tmp = await makeTempDir("sprout-m7-gzipq0-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js", {
        headers: { "accept-encoding": "gzip;q=0" },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-encoding"), null);
    const body = await res.text();
    // Raw bytes (not gzip); they should look like JS.
    assertStringIncludes(body, "start");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: Accept-Encoding: identity does not receive gzip", async () => {
  const tmp = await makeTempDir("sprout-m7-identity-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js", {
        headers: { "accept-encoding": "identity" },
      }),
    );
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-encoding"), null);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: /@sprout/island/Counter.js and cart/AddButton.js are served", async () => {
  const tmp = await makeTempDir("sprout-m7-islands-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    for (
      const path of [
        "/@sprout/island/Counter.js",
        "/@sprout/island/cart/AddButton.js",
      ]
    ) {
      const res = await app.fetch(new Request("http://0.0.0.0" + path));
      assertEquals(res.status, 200, `${path} should be 200`);
      assertEquals(res.headers.get("content-type"), "text/javascript; charset=utf-8");
      assertEquals(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
      assertEquals(res.headers.get("x-content-type-options"), "nosniff");
      const body = await res.text();
      assert(body.length > 0);
    }
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: /@sprout/app.css returns text/css", async () => {
  const tmp = await makeTempDir("sprout-m7-css-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(new Request("http://0.0.0.0/@sprout/app.css"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("content-type"), "text/css; charset=utf-8");
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const body = await res.text();
    assertStringIncludes(body, "body");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: /@sprout/island/Missing.js returns 404", async () => {
  const tmp = await makeTempDir("sprout-m7-missing-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(new Request("http://0.0.0.0/@sprout/island/Missing.js"));
    assertEquals(res.status, 404);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: /@sprout/vendor.js returns 404 (no vendor bundle in MVP)", async () => {
  const tmp = await makeTempDir("sprout-m7-vendor-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(new Request("http://0.0.0.0/@sprout/vendor.js"));
    assertEquals(res.status, 404);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// preload invariant: startup does not read all asset bytes
// ---------------------------------------------------------------------------

Deno.test("prod asset: createApp does not preload any _sprout/ bytes", async () => {
  const tmp = await makeTempDir("sprout-m7-preload-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    // Wrap Deno.readFile to count calls to any path under
    // `<tmp>/.sprout/dist/_sprout/`.
    let sproutReads = 0;
    const orig = Deno.readFile;
    // deno-lint-ignore no-explicit-any
    (Deno as any).readFile = (path: string | URL) => {
      const s = String(path);
      if (s.includes(`${tmp.path}/.sprout/dist/_sprout/`)) {
        sproutReads++;
      }
      return orig(path as string | URL);
    };
    try {
      await bootProductionApp(tmp.path);
      // No requests have been made yet.
      assertEquals(
        sproutReads,
        0,
        "createApp must not preload any _sprout/ bytes",
      );
    } finally {
      // deno-lint-ignore no-explicit-any
      (Deno as any).readFile = orig;
    }
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: a single request reads exactly the raw asset + gzip companion from _sprout/", async () => {
  const tmp = await makeTempDir("sprout-m7-one-read-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    let sproutReads = 0;
    const orig = Deno.readFile;
    // deno-lint-ignore no-explicit-any
    (Deno as any).readFile = (path: string | URL) => {
      const s = String(path);
      if (s.includes(`${tmp.path}/.sprout/dist/_sprout/`)) {
        sproutReads++;
      }
      return orig(path as string | URL);
    };
    try {
      const res = await app.fetch(new Request("http://0.0.0.0/@sprout/runtime.js"));
      assertEquals(res.status, 200);
      // Two reads: raw + gzip companion.
      assertEquals(sproutReads, 2);
      // A second request hits the disk again because the
      // default config has `frozenAssetCache: "none"`.
      const res2 = await app.fetch(new Request("http://0.0.0.0/@sprout/runtime.js"));
      assertEquals(res2.status, 200);
      assertEquals(sproutReads, 4);
    } finally {
      // deno-lint-ignore no-explicit-any
      (Deno as any).readFile = orig;
    }
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// public file behavior in production
// ---------------------------------------------------------------------------

Deno.test("prod asset: public files use max-age=3600 (not immutable, not no-store)", async () => {
  const tmp = await makeTempDir("sprout-m7-public-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(new Request("http://0.0.0.0/favicon.svg"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("cache-control"), "public, max-age=3600");
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 304 path: body is empty and the ETag is preserved
// ---------------------------------------------------------------------------

Deno.test("prod asset: 304 response has empty body, ETag, nosniff, content-type, and cache headers", async () => {
  const tmp = await makeTempDir("sprout-m7-304-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js", {
        headers: { "if-none-match": '"' + (await firstEtag(app, "/@sprout/runtime.js")) + '"' },
      }),
    );
    assertEquals(res.status, 304);
    assertEquals(
      res.headers.get("etag"),
      '"' + (await firstEtag(app, "/@sprout/runtime.js")) + '"',
    );
    // Per RFC 7232 §4.1, 304 should include the same content-type
    // the 200 would have (text/javascript for runtime.js).
    assertEquals(res.headers.get("content-type"), "text/javascript; charset=utf-8");
    assertEquals(res.headers.get("cache-control"), "public, max-age=31536000, immutable");
    assertEquals(res.headers.get("vary"), "accept-encoding");
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const body = await res.text();
    assertEquals(body, "");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Bounded LRU: the cap is honored across requests
// ---------------------------------------------------------------------------

Deno.test("prod asset: bounded LRU is honored when configured", async () => {
  const tmp = await makeTempDir("sprout-m7-lru-");
  try {
    await copyFixtureTo(tmp.path);
    // Use a tiny cap to force eviction. We override the config
    // by writing a fresh sprout.config.ts that sets the cap.
    const configPath = join(tmp.path, "sprout.config.ts");
    await Deno.writeTextFile(
      configPath,
      `export default { root: ".", outDir: ".sprout/dist", build: { frozenAssetCache: { kind: "bounded", maxBytes: 100 } } };\n`,
    );
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);

    // Count disk reads.
    let sproutReads = 0;
    const orig = Deno.readFile;
    // deno-lint-ignore no-explicit-any
    (Deno as any).readFile = (path: string | URL) => {
      const s = String(path);
      if (s.includes(`${tmp.path}/.sprout/dist/_sprout/`)) {
        sproutReads++;
      }
      return orig(path as string | URL);
    };
    try {
      // First request: cache miss -> 2 reads (raw + gzip).
      const r1 = await app.fetch(new Request("http://0.0.0.0/@sprout/runtime.js"));
      assertEquals(r1.status, 200);
      assertEquals(sproutReads, 2);

      // Second request for the same asset: cache hit -> 0 reads.
      const r2 = await app.fetch(new Request("http://0.0.0.0/@sprout/runtime.js"));
      assertEquals(r2.status, 200);
      assertEquals(sproutReads, 2);

      // Request a different asset: cache miss -> 1 read (raw only —
      // the basic-app CSS fixture is too small to benefit from gzip,
      // so it has no .gz companion on disk).
      const r3 = await app.fetch(new Request("http://0.0.0.0/@sprout/app.css"));
      assertEquals(r3.status, 200);
      assertEquals(sproutReads, 3);

      // The LRU stats seam reports the cap-bound state.
      const stats = app.getAssetCacheStats();
      assertExists(stats);
      // The total is the sum of the runtime + css raw+gzip sizes
      // (small enough to fit under the 100-byte cap individually
      // but it adds up). The invariant is `size <= 100`.
      assert(stats.size <= 100, `LRU size ${stats.size} should be <= 100`);
    } finally {
      // deno-lint-ignore no-explicit-any
      (Deno as any).readFile = orig;
    }
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("prod asset: getAssetCacheStats returns null when the LRU is disabled", async () => {
  const tmp = await makeTempDir("sprout-m7-lru-disabled-");
  try {
    await copyFixtureTo(tmp.path);
    await buildProjectAt(tmp.path);
    const app = await bootProductionApp(tmp.path);
    assertEquals(app.getAssetCacheStats(), null);
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Missing manifest: 500 with a typed error
// ---------------------------------------------------------------------------

Deno.test("prod asset: missing manifest -> 404 with a typed STATIC_FILE_NOT_FOUND", async () => {
  const tmp = await makeTempDir("sprout-m7-no-manifest-");
  try {
    await copyFixtureTo(tmp.path);
    // Do NOT run buildProduction. Boot the app and ask for an
    // asset: the response is 404 with a typed body that hints
    // at `sprout build`.
    const app = await bootProductionApp(tmp.path);
    const res = await app.fetch(new Request("http://0.0.0.0/@sprout/runtime.js"));
    assertEquals(res.status, 404);
    const body = await res.text();
    assertStringIncludes(body, "sprout build");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

/** Hit the asset once and return the bare 16-hex ETag. */
async function firstEtag(app: App, publicPath: string): Promise<string> {
  const res = await app.fetch(new Request("http://0.0.0.0" + publicPath));
  const etag = res.headers.get("etag");
  assertExists(etag);
  return etag.slice(1, -1);
}
