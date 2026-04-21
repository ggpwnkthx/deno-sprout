// lib/cache.ts - Shared LRU bounded cache
/**
 * A LRU-style bounded cache that evicts the least-recently-accessed entry
 * when capacity is reached and a new key is inserted.
 *
 * Access order is updated on both `get` and `set`. Eviction removes the
 * oldest entry by insertion order (the entry accessed longest ago).
 *
 * @typeParam K - Key type.
 * @typeParam V - Value type.
 */
export class BoundedCache<K, V> {
  #map = new Map<K, V>();
  #capacity: number;
  constructor(capacity: number) {
    this.#capacity = capacity;
  }
  /**
   * Returns the value for `key`, or `undefined` if not found.
   * Updates access order by moving `key` to the most-recently-used position.
   */
  get(key: K): V | undefined {
    const value = this.#map.get(key);
    if (value !== undefined) {
      // Move to end to mark as most recently used
      this.#map.delete(key);
      this.#map.set(key, value);
    }
    return value;
  }
  /**
   * Sets `key` to `value`. If the cache is at capacity, the least-recently-used
   * entry is evicted before `key` is inserted.
   */
  set(key: K, value: V): void {
    // Delete first so that (re)insertion moves to the end
    this.#map.delete(key);
    if (this.#map.size >= this.#capacity) {
      const firstKey = this.#map.keys().next().value;
      if (firstKey !== undefined) this.#map.delete(firstKey);
    }
    this.#map.set(key, value);
  }
}
