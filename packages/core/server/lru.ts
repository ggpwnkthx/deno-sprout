// Bounded LRU cache for the M7 production serve.
//
// The M7 frozen asset serve reads a single asset's bytes (raw and
// optionally gzip) on demand. The framework owns the asset cache
// size, not the OS, so a single project with a very large
// `<outDir>/_sprout/` directory cannot rely on the kernel's page
// cache to bound resident memory. A bounded LRU keyed on public
// path with a per-value byte size cap is the right tool: it makes
// "asset N stays in memory" a property the spec can pin.
//
// The implementation is a `Map` plus a `bytes` counter. `Map`
// iteration order in JavaScript is insertion order, so the front
// of the iteration is the least-recently-used entry and the back
// is the most-recently-used. A `get` call moves the entry to the
// back so the LRU invariant is preserved across reads as well as
// writes.

/**
 * A single LRU entry: the cached value plus the byte size the
 * caller reported for it. The byte size is a number of bytes;
 * the value itself may be anything (a `Uint8Array`, a parsed
 * `Response`, ...).
 */
export type LruEntry<V> = {
  readonly value: V;
  readonly size: number;
};

/**
 * A simple bounded LRU keyed on a hashable key.
 *
 * Invariant: after every {@link set} call, `bytes <= maxBytes`.
 * The class evicts least-recently-used entries from the front of
 * the underlying `Map` until the invariant holds. `get` promotes
 * the entry to the back of the iteration order so the next `set`
 * sees it as most-recently-used.
 *
 * `set` with a `size: 0` value is allowed: the entry is recorded
 * as present (so a follow-up `get` hits) but does not contribute
 * to the byte budget. The intent is to let the serve layer
 * distinguish "this entry's bytes are in memory" from "this entry
 * is missing, ignore it" without a separate sentinel map.
 */
export class BoundedLru<K, V> implements Iterable<[K, LruEntry<V>]> {
  readonly #maxBytes: number;
  readonly #store: Map<K, LruEntry<V>> = new Map();
  #bytes = 0;

  constructor(maxBytes: number) {
    if (!Number.isFinite(maxBytes) || maxBytes < 0) {
      throw new RangeError(
        `BoundedLru: maxBytes must be a non-negative finite number, got ${maxBytes}`,
      );
    }
    this.#maxBytes = maxBytes;
  }

  /** The current total byte size of all stored entries. */
  get size(): number {
    return this.#bytes;
  }

  /** The current entry count. */
  get count(): number {
    return this.#store.size;
  }

  /** The configured cap. */
  get maxBytes(): number {
    return this.#maxBytes;
  }

  /**
   * Look up a key. On hit, the entry is moved to the end of the
   * iteration order (most-recently-used). On miss, returns
   * `undefined`.
   *
   * Concurrency: the delete+set pair is two separate Map operations
   * and is therefore subject to a subtle TOCTOU under concurrent
   * async contexts. The Deno runtime is single-threaded so the race
   * does not occur in practice; the contract is "best-effort MRU
   * promotion." Callers that need strict MRU semantics should
   * serialize access (e.g., via a wrapper around this LRU).
   */
  get(key: K): V | undefined {
    const entry = this.#store.get(key);
    if (entry === undefined) {
      return undefined;
    }
    // Promote to MRU. Map preserves insertion order, so
    // delete + set re-inserts at the back.
    this.#store.delete(key);
    this.#store.set(key, entry);
    return entry.value;
  }

  /**
   * Store a value. If `key` is already present, the old entry's
   * size is subtracted from the running total before the new
   * entry is recorded. The new entry is inserted at the back
   * (most-recently-used). Entries are evicted from the front
   * (least-recently-used) until the byte cap is honored.
   */
  set(key: K, value: V, size: number): void {
    if (!Number.isFinite(size) || size < 0) {
      throw new RangeError(
        `BoundedLru.set: size must be a non-negative finite number, got ${size}`,
      );
    }
    // If the key is already present, drop the old size first.
    const existing = this.#store.get(key);
    if (existing !== undefined) {
      this.#bytes -= existing.size;
      this.#store.delete(key);
    }
    this.#store.set(key, { value, size });
    this.#bytes += size;
    // Evict until the cap is honored. Walk from the front; for
    // safety, also break out if we somehow cannot make progress
    // (e.g. a single entry larger than the cap: we still store
    // it so the cache is "honest about its capacity" rather than
    // silently losing the entry).
    while (this.#bytes > this.#maxBytes && this.#store.size > 1) {
      const oldestKey = this.#store.keys().next().value as K | undefined;
      if (oldestKey === undefined) break;
      const oldestEntry = this.#store.get(oldestKey);
      this.#store.delete(oldestKey);
      if (oldestEntry !== undefined) {
        this.#bytes -= oldestEntry.size;
      }
    }
  }

  /**
   * Remove a key. Returns `true` when the key was present.
   */
  delete(key: K): boolean {
    const entry = this.#store.get(key);
    if (entry === undefined) {
      return false;
    }
    this.#bytes -= entry.size;
    this.#store.delete(key);
    return true;
  }

  /**
   * Drop every entry. The cache is empty and `bytes` is `0`.
   */
  clear(): void {
    this.#store.clear();
    this.#bytes = 0;
  }

  /**
   * Whether the cache currently holds a value for `key`. Does NOT
   * promote the entry to MRU; use {@link get} when promotion
   * matters.
   */
  has(key: K): boolean {
    return this.#store.has(key);
  }

  /**
   * Iterate over entries. The order is least-recently-used first.
   * Callers must not mutate the cache during iteration.
   */
  *[Symbol.iterator](): IterableIterator<[K, LruEntry<V>]> {
    yield* this.#store.entries();
  }

  /**
   * Iterate over entries in least-recently-used → most-recently-used
   * order. Same constraints as `Symbol.iterator`.
   */
  entries(): IterableIterator<[K, LruEntry<V>]> {
    return this.#store.entries();
  }
}
