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
};

Deno.test("keyOf: returns the joined string of the key fields", () => {
  assertEquals(
    keyOf(baseKey),
    "/abs/main.tsx|island|Main|development|abc123",
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
