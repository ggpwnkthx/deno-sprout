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
  readonly jsxImportSource: string;
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
  const fields = [
    key.entry,
    key.kind,
    key.id,
    key.mode,
    key.envHash,
    key.jsxImportSource,
  ];
  return fields.map((f) => `${f.length}:${f}`).join("");
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
 * FIFO queue for bounded-concurrency permit acquisition.
 * A permit represents one concurrent build slot. Callers dequeue
 * a permit before building and call `release` when done.
 * When `maxConcurrent` is `Infinity` the queue is never entered
 * and every caller gets an immediate permit.
 */
class Semaphore {
  readonly #max: number;
  readonly #queue: Array<() => void> = [];
  #running = 0;

  constructor(maxConcurrent: number) {
    this.#max = maxConcurrent;
  }

  /**
   * Try to acquire a permit without waiting. Returns `true` if
   * acquired immediately, `false` if the caller should await
   * `acquire()` instead.
   */
  tryAcquire(): boolean {
    if (this.#max === Infinity) return true;
    if (this.#running < this.#max) {
      this.#running++;
      return true;
    }
    return false;
  }

  /** Acquire a permit. Queues if at capacity; never rejects. */
  async acquire(): Promise<void> {
    if (this.#max === Infinity) return;
    if (this.#running < this.#max) {
      this.#running++;
      return;
    }
    await new Promise<void>((resolve) => {
      this.#queue.push(resolve);
    });
    this.#running++;
  }

  /** Release a permit and dequeue the next waiter if any. */
  release(): void {
    if (this.#max === Infinity) return;
    this.#running--;
    const next = this.#queue.shift();
    if (next !== undefined) {
      // Schedule asynchronously so the next permit is granted
      // after the current call stack unwinds, matching the
      // FIFO order of the queue.
      Promise.resolve().then(next);
    }
  }

  /** Current number of running builds. Exposed for tests. */
  get running(): number {
    return this.#running;
  }
}

/**
 * Single-flight dev build cache.
 *
 * Concurrent calls with the same key share one in-flight build.
 * After a build settles, the entry is stored in the internal map
 * and the next call short-circuits to a stat-check.
 *
 * @param maxConcurrent - Maximum number of distinct builds that run
 *   concurrently across all keys. Use `Infinity` (the default) for
 *   unbounded concurrency. Finite values bound thundering-herd
 *   spikes by queuing excess calls in FIFO order until a slot
 *   opens.
 */
export class SingleFlightCache {
  readonly #map: Map<string, CacheEntry> = new Map();
  readonly #inflight: Map<string, Promise<CacheEntry>> = new Map();
  readonly #sem: Semaphore;

  constructor(maxConcurrent: number = Infinity) {
    this.#sem = new Semaphore(maxConcurrent);
  }

  /**
   * Get the cached entry for `key`, or build a new one. Concurrent
   * calls with the same key coalesce: the build callback runs
   * exactly once and all callers resolve with the same
   * `CacheEntry`.
   */
  async getOrBuild(
    key: CacheKey,
    build: () => Promise<EsbuildBundleResult>,
  ): Promise<CacheEntry> {
    const k = keyOf(key);

    // Fast path: return a shared promise for an in-flight build
    // without acquiring a semaphore slot.
    const existing = this.#inflight.get(k);
    if (existing !== undefined) {
      return existing;
    }

    // Try to acquire a permit synchronously. If the cache is busy,
    // we MUST wait for a slot before creating another in-flight
    // entry so that concurrent distinct builds are bounded.
    const acquired = this.#sem.tryAcquire();
    if (!acquired) {
      await this.#sem.acquire();
    }

    // Re-check the in-flight slot after acquiring: another
    // request may have started the same build while we were
    // waiting for a permit.
    const inflight = this.#inflight.get(k);
    if (inflight !== undefined) {
      this.#sem.release();
      return inflight;
    }

    const cached = this.#map.get(k);
    if (cached !== undefined && await this.#isStillValid(cached)) {
      this.#sem.release();
      return cached;
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

    // Attach the semaphore release to the build promise settlement.
    // This runs when the build resolves OR rejects, not when the
    // caller returns. This is correct for semaphore accounting:
    // the permit is held for the lifetime of the actual build,
    // not for the synchronous setup phase.
    promise.then(
      () => this.#sem.release(),
      () => this.#sem.release(),
    );

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

  #isStillValid(entry: CacheEntry): Promise<boolean> {
    return Promise.all(
      entry.result.inputs.map(async (input) => {
        try {
          const stat = await Deno.stat(input.path);
          return stat.mtime?.getTime() === input.mtime;
        } catch (_cause) {
          // The file went away; treat as invalid so the next call
          // rebuilds.
          return false;
        }
      }),
    ).then((results) => results.every(Boolean));
  }
}
