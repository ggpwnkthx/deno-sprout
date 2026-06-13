// Single-flight dev build cache for the @sprout/compiler M4 dev asset
// pipeline. Concurrent identical compileDevAsset calls coalesce; the
// resulting entry is reused on subsequent calls as long as no input
// has changed.
import { encodeHex } from "@std/encoding/hex";
import type { EsbuildBundleResult } from "./esbuild.ts";

/** Stable cache key for a single dev asset. */
export type CacheKey = {
  readonly entry: string;
  readonly kind: "runtime" | "island" | "style";
  readonly id: string;
  readonly mode: "development" | "production";
  readonly envHash: string;
};

/** A cached bundle plus the metadata that produced it. */
export type CacheEntry = {
  readonly result: EsbuildBundleResult;
  /** The serialized cache key. */
  readonly key: string;
  /** When the entry was built, in milliseconds since epoch. */
  readonly builtAt: number;
};

/** Compute the string form of a {@link CacheKey}. */
export function keyOf(key: CacheKey): string {
  return [key.entry, key.kind, key.id, key.mode, key.envHash].join("|");
}

/**
 * Compute a 16-character hex hash of the input set. The hash
 * covers the sorted `path` and `mtime` of every input; the same
 * input set always produces the same hash. The cache re-stats on
 * a hit before trusting the entry, so a hash collision only costs
 * one rebuild.
 */
export function hashInputs(
  inputs: readonly { readonly path: string; readonly mtime: number }[],
): string {
  const lines: string[] = [];
  for (
    const i of [...inputs].sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  ) {
    lines.push(`${i.path}\0${i.mtime}`);
  }
  return encodeHex(new TextEncoder().encode(lines.join("\n"))).slice(0, 16);
}

/**
 * Single-flight dev build cache.
 *
 * Concurrent calls with the same key share one in-flight build.
 * After a build settles, the entry is stored in the internal map
 * and the next call short-circuits to a stat-check.
 */
export class SingleFlightCache {
  readonly #map: Map<string, CacheEntry> = new Map();
  readonly #inflight: Map<string, Promise<CacheEntry>> = new Map();

  /**
   * Get the cached entry for `key`, or build a new one. Concurrent
   * calls with the same key coalesce: the build callback runs
   * exactly once and all callers resolve with the same
   * `CacheEntry`.
   */
  getOrBuild(
    key: CacheKey,
    build: () => Promise<EsbuildBundleResult>,
  ): Promise<CacheEntry> {
    const k = keyOf(key);
    const existing = this.#inflight.get(k);
    if (existing !== undefined) {
      return existing;
    }
    const cached = this.#map.get(k);
    if (cached !== undefined && this.#isStillValid(cached)) {
      return Promise.resolve(cached);
    }
    if (cached !== undefined) {
      // Stale; drop and rebuild.
      this.#map.delete(k);
    }
    const promise = (async (): Promise<CacheEntry> => {
      const result = await build();
      const entry: CacheEntry = {
        result,
        key: k,
        builtAt: Date.now(),
      };
      this.#map.set(k, entry);
      return entry;
    })();
    this.#inflight.set(k, promise);
    // Ensure the in-flight slot is cleared on settle so the next
    // call (after a stat-miss) gets to build again. Use
    // `then(onFulfilled, onRejected)` rather than `finally`:
    // `finally` returns a new promise that re-rejects when the
    // handler does not swallow the rejection, which would leak an
    // unhandled rejection when `build()` fails. Attaching the
    // cleanup directly to the original promise avoids the
    // dangling second promise entirely; the original still
    // propagates the rejection to the caller.
    promise.then(
      () => {
        this.#inflight.delete(k);
      },
      () => {
        this.#inflight.delete(k);
      },
    );
    return promise;
  }

  /**
   * Drop every entry whose key matches `predicate`. With no
   * predicate, drop everything. Used by tests and by future
   * `clear` / `invalidate` hot paths.
   */
  invalidate(predicate?: (k: string) => boolean): void {
    if (predicate === undefined) {
      this.#map.clear();
      return;
    }
    for (const k of [...this.#map.keys()]) {
      if (predicate(k)) {
        this.#map.delete(k);
      }
    }
  }

  /** Drop every entry. */
  clear(): void {
    this.#map.clear();
  }

  /** Current number of cached entries. Exposed for tests. */
  get size(): number {
    return this.#map.size;
  }

  #isStillValid(entry: CacheEntry): boolean {
    for (const input of entry.result.inputs) {
      let mtime = 0;
      try {
        const stat = Deno.statSync(input.path);
        mtime = stat.mtime?.getTime() ?? 0;
      } catch (_cause) {
        // The file went away; treat as invalid so the next call
        // rebuilds.
        return false;
      }
      if (mtime !== input.mtime) {
        return false;
      }
    }
    return true;
  }
}
