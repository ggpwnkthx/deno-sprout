// Tests for the single-flight dev build cache.
import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { hashInputs, keyOf, SingleFlightCache } from "./build/cache.ts";
import type { CacheKey } from "./build/cache.ts";
import type { EsbuildBundleResult } from "./build/esbuild.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const TMP_ROOT = join(REPO_ROOT, "tests/.tmp");

const baseKey: CacheKey = {
  entry: "/abs/main.tsx",
  kind: "island",
  id: "Main",
  mode: "development",
  envHash: "abc123",
  jsxImportSource: "@sprout/jsx",
};

Deno.test("keyOf: returns the joined string of the key fields", () => {
  assertEquals(
    keyOf(baseKey),
    "/abs/main.tsx|island|Main|development|abc123|@sprout/jsx",
  );
});

Deno.test("hashInputs: same inputs produce the same hash", () => {
  const a = hashInputs([
    { path: "/a.ts", mtime: 1 },
    { path: "/b.ts", mtime: 2 },
  ]);
  const b = hashInputs([
    { path: "/b.ts", mtime: 2 },
    { path: "/a.ts", mtime: 1 },
  ]);
  assertEquals(a, b);
  assertEquals(a.length, 16);
});

Deno.test("hashInputs: mtime change produces a different hash", () => {
  const a = hashInputs([{ path: "/a.ts", mtime: 1 }]);
  const b = hashInputs([{ path: "/a.ts", mtime: 2 }]);
  assertNotEquals(a, b);
});

Deno.test("SingleFlightCache: coalesces concurrent calls", async () => {
  const cache = new SingleFlightCache();
  // Use a real on-disk file as the entry so the stat check on a
  // hit does not fall through to the "file went away" path.
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf-", dir: TMP_ROOT });
  try {
    const file = join(tmp, "main.tsx");
    await Deno.writeTextFile(file, "export const x = 1;\n");
    let calls = 0;
    const build = async (): Promise<EsbuildBundleResult> => {
      await Promise.resolve();
      calls++;
      await new Promise((r) => setTimeout(r, 30));
      const stat = Deno.statSync(file);
      return {
        code: new TextEncoder().encode("v1"),
        map: null,
        inputs: [{ path: file, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const key: CacheKey = { ...baseKey, entry: file };
    const promises = Array.from(
      { length: 5 },
      () => cache.getOrBuild(key, build),
    );
    const results = await Promise.all(promises);
    assertEquals(calls, 1, "build should have run exactly once");
    for (const r of results) {
      assertEquals(new TextDecoder().decode(r.result.code), "v1");
      assertEquals(r.key, keyOf(key));
    }
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("SingleFlightCache: subsequent calls with no input change return the cached entry", async () => {
  const cache = new SingleFlightCache();
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf2-", dir: TMP_ROOT });
  try {
    const file = join(tmp, "main.tsx");
    await Deno.writeTextFile(file, "export const x = 1;\n");
    let calls = 0;
    const build = async (): Promise<EsbuildBundleResult> => {
      await Promise.resolve();
      calls++;
      const stat = Deno.statSync(file);
      return {
        code: new TextEncoder().encode("v1"),
        map: null,
        inputs: [{ path: file, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const key: CacheKey = { ...baseKey, entry: file };
    const a = await cache.getOrBuild(key, build);
    const b = await cache.getOrBuild(key, build);
    assertEquals(calls, 1);
    assertEquals(a, b);
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("SingleFlightCache: invalidate clears the matching entry", async () => {
  const cache = new SingleFlightCache();
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf3-", dir: TMP_ROOT });
  try {
    const file = join(tmp, "main.tsx");
    await Deno.writeTextFile(file, "export const x = 1;\n");
    let calls = 0;
    const build = async (): Promise<EsbuildBundleResult> => {
      await Promise.resolve();
      calls++;
      const stat = Deno.statSync(file);
      return {
        code: new TextEncoder().encode(`v${calls}`),
        map: null,
        inputs: [{ path: file, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const key: CacheKey = { ...baseKey, entry: file };
    const a = await cache.getOrBuild(key, build);
    assertEquals(new TextDecoder().decode(a.result.code), "v1");
    cache.invalidate();
    const b = await cache.getOrBuild(key, build);
    assertEquals(new TextDecoder().decode(b.result.code), "v2");
    assertEquals(calls, 2);
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("SingleFlightCache: stat-mtime change drops the entry on the next call", async () => {
  const cache = new SingleFlightCache();
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf4-", dir: TMP_ROOT });
  try {
    const file = join(tmp, "main.tsx");
    await Deno.writeTextFile(file, "export const x = 1;\n");
    let calls = 0;
    const build = async (): Promise<EsbuildBundleResult> => {
      await Promise.resolve();
      calls++;
      const stat = Deno.statSync(file);
      return {
        code: new TextEncoder().encode(`v${calls}`),
        map: null,
        inputs: [{ path: file, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const key: CacheKey = { ...baseKey, entry: file };
    await cache.getOrBuild(key, build);
    assertEquals(calls, 1);
    await new Promise((r) => setTimeout(r, 20));
    await Deno.writeTextFile(file, "export const x = 2;\n");
    const b = await cache.getOrBuild(key, build);
    assertEquals(calls, 2, "mtime change should force a rebuild");
    assertEquals(new TextDecoder().decode(b.result.code), "v2");
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("SingleFlightCache: size reflects the number of cached entries", async () => {
  const cache = new SingleFlightCache();
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf5-", dir: TMP_ROOT });
  try {
    const a = join(tmp, "a.tsx");
    const b = join(tmp, "b.tsx");
    await Deno.writeTextFile(a, "export default 1;\n");
    await Deno.writeTextFile(b, "export default 2;\n");
    const buildA = async (): Promise<EsbuildBundleResult> => {
      await Promise.resolve();
      const stat = Deno.statSync(a);
      return {
        code: new Uint8Array(),
        map: null,
        inputs: [{ path: a, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const buildB = async (): Promise<EsbuildBundleResult> => {
      await Promise.resolve();
      const stat = Deno.statSync(b);
      return {
        code: new Uint8Array(),
        map: null,
        inputs: [{ path: b, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    assertEquals(cache.size, 0);
    await cache.getOrBuild({ ...baseKey, entry: a }, buildA);
    assertEquals(cache.size, 1);
    await cache.getOrBuild({ ...baseKey, entry: b }, buildB);
    assertEquals(cache.size, 2);
    cache.clear();
    assertEquals(cache.size, 0);
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("SingleFlightCache: respects maxConcurrent across distinct keys", async () => {
  const cache = new SingleFlightCache(2);
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf6-", dir: TMP_ROOT });
  try {
    const files = await Promise.all(
      Array.from({ length: 4 }, (_, i) => {
        const f = join(tmp, `f${i}.tsx`);
        return Deno.writeTextFile(f, `export default ${i};\n`).then(() => f);
      }),
    );
    let running = 0;
    let maxRunning = 0;
    const builds = files.map((file, i) => async (): Promise<EsbuildBundleResult> => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      const stat = Deno.statSync(file);
      return {
        code: new TextEncoder().encode(`v${i}`),
        map: null,
        inputs: [{ path: file, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    });
    const keys = files.map((file, i) => ({ ...baseKey, entry: file, id: `K${i}` }));
    await Promise.all(keys.map((key, i) => cache.getOrBuild(key, builds[i]!)));
    assertEquals(maxRunning <= 2, true, `maxRunning=${maxRunning} should be <= 2`);
    assertEquals(running, 0, "all builds should have finished");
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("SingleFlightCache: queued builds run in FIFO order", async () => {
  const cache = new SingleFlightCache(1);
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf7-", dir: TMP_ROOT });
  try {
    const a = join(tmp, "a.tsx");
    const b = join(tmp, "b.tsx");
    const c = join(tmp, "c.tsx");
    await Deno.writeTextFile(a, "export default 1;\n");
    await Deno.writeTextFile(b, "export default 2;\n");
    await Deno.writeTextFile(c, "export default 3;\n");
    const startOrder: string[] = [];
    // Fastest first in terms of delay, but all start within the same tick.
    // With maxConcurrent=1, they should start in request order: a, b, c.
    const buildA = async (): Promise<EsbuildBundleResult> => {
      startOrder.push("a");
      await new Promise((r) => setTimeout(r, 50));
      const stat = Deno.statSync(a);
      return {
        code: new TextEncoder().encode("a"),
        map: null,
        inputs: [{ path: a, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const buildB = async (): Promise<EsbuildBundleResult> => {
      startOrder.push("b");
      await new Promise((r) => setTimeout(r, 30));
      const stat = Deno.statSync(b);
      return {
        code: new TextEncoder().encode("b"),
        map: null,
        inputs: [{ path: b, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const buildC = async (): Promise<EsbuildBundleResult> => {
      startOrder.push("c");
      await new Promise((r) => setTimeout(r, 10));
      const stat = Deno.statSync(c);
      return {
        code: new TextEncoder().encode("c"),
        map: null,
        inputs: [{ path: c, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const keyA = { ...baseKey, entry: a, id: "KA" };
    const keyB = { ...baseKey, entry: b, id: "KB" };
    const keyC = { ...baseKey, entry: c, id: "KC" };
    await Promise.all([
      cache.getOrBuild(keyA, buildA),
      cache.getOrBuild(keyB, buildB),
      cache.getOrBuild(keyC, buildC),
    ]);
    assertEquals(startOrder, ["a", "b", "c"], "FIFO start order expected");
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("SingleFlightCache: build failure releases the permit", async () => {
  const cache = new SingleFlightCache(1);
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf8-", dir: TMP_ROOT });
  try {
    const a = join(tmp, "a.tsx");
    const b = join(tmp, "b.tsx");
    await Deno.writeTextFile(a, "export default 1;\n");
    await Deno.writeTextFile(b, "export default 2;\n");
    let secondStarted = false;
    const buildA = (): Promise<EsbuildBundleResult> => {
      return Promise.reject(new Error("first fail"));
    };
    const buildB = (): Promise<EsbuildBundleResult> => {
      secondStarted = true;
      const stat = Deno.statSync(b);
      return Promise.resolve({
        code: new TextEncoder().encode("b"),
        map: null,
        inputs: [{ path: b, mtime: stat.mtime?.getTime() ?? 0 }],
      });
    };
    const keyA = { ...baseKey, entry: a, id: "KA" };
    const keyB = { ...baseKey, entry: b, id: "KB" };
    const [resultA, resultB] = await Promise.allSettled([
      cache.getOrBuild(keyA, buildA),
      cache.getOrBuild(keyB, buildB),
    ]);
    assertEquals(resultA.status, "rejected", "first build should reject");
    assertEquals(resultB.status, "fulfilled", "second build should succeed");
    assertEquals(secondStarted, true, "second build should have started");
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("sprout-sf10-SingleFlightCache: cache hit does not leak a permit", async () => {
  const cache = new SingleFlightCache(2);
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf10-", dir: TMP_ROOT });
  try {
    const a = join(tmp, "a.tsx");
    const b = join(tmp, "b.tsx");
    await Deno.writeTextFile(a, "export default 1;\n");
    await Deno.writeTextFile(b, "export default 2;\n");
    const buildA = async (): Promise<EsbuildBundleResult> => {
      await Promise.resolve();
      const stat = Deno.statSync(a);
      return {
        code: new TextEncoder().encode("a"),
        map: null,
        inputs: [{ path: a, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const buildB = async (): Promise<EsbuildBundleResult> => {
      await Promise.resolve();
      const stat = Deno.statSync(b);
      return {
        code: new TextEncoder().encode("b"),
        map: null,
        inputs: [{ path: b, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    };
    const keyA = { ...baseKey, entry: a, id: "KA" };
    const keyB = { ...baseKey, entry: b, id: "KB" };
    // Populate the cache.
    await cache.getOrBuild(keyA, buildA);
    assertEquals(cache.size, 1);
    // 10 sequential cache hits — none of these should leak a permit.
    for (let i = 0; i < 10; i++) {
      await cache.getOrBuild(keyA, buildA);
    }
    assertEquals(cache.size, 1, "cache should still have exactly one entry");
    // A distinct key must still be able to build. If permits leaked,
    // the semaphore would be permanently full and this call would hang.
    const result = await Promise.race([
      cache.getOrBuild(keyB, buildB),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 500)),
    ]);
    assertEquals(new TextDecoder().decode(result.result.code), "b");
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("SingleFlightCache: default is unbounded", async () => {
  const cache = new SingleFlightCache();
  const tmp = await Deno.makeTempDir({ prefix: "sprout-sf9-", dir: TMP_ROOT });
  try {
    const files = await Promise.all(
      Array.from({ length: 5 }, (_, i) => {
        const f = join(tmp, `u${i}.tsx`);
        return Deno.writeTextFile(f, `export default ${i};\n`).then(() => f);
      }),
    );
    let running = 0;
    let maxRunning = 0;
    const builds = files.map((file, i) => async (): Promise<EsbuildBundleResult> => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      const stat = Deno.statSync(file);
      return {
        code: new TextEncoder().encode(`v${i}`),
        map: null,
        inputs: [{ path: file, mtime: stat.mtime?.getTime() ?? 0 }],
      };
    });
    const keys = files.map((file, i) => ({ ...baseKey, entry: file, id: `U${i}` }));
    await Promise.all(keys.map((key, i) => cache.getOrBuild(key, builds[i]!)));
    assertEquals(maxRunning, 5, `maxRunning=${maxRunning} should be 5 (unbounded)`);
    assertEquals(running, 0, "all builds should have finished");
  } finally {
    try {
      await Deno.remove(tmp, { recursive: true });
    } catch (_cause) {
      // ignore
    }
  }
});

Deno.test("sprout-sf11-SingleFlightCache: different jsxImportSource values produce different cache keys", () => {
  const keyA: CacheKey = {
    ...baseKey,
    entry: "/abs/main.tsx",
    id: "Main",
    jsxImportSource: "@sprout/jsx",
  };
  const keyB: CacheKey = {
    ...baseKey,
    entry: "/abs/main.tsx",
    id: "Main",
    jsxImportSource: "@sprout/jsx/dom",
  };
  assertNotEquals(keyOf(keyA), keyOf(keyB));
});
