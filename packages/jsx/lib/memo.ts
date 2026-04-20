/**
 * Memoization helper that caches the results of the given function.
 *
 * Uses a per-function cache capped at **256 entries** with LRU eviction.
 * When the cap is reached, the least recently used entry is removed before
 * adding a new one, preventing unbounded memory growth regardless of argument
 * cardinality.
 *
 * ## Cache key construction
 *
 * Arguments are serialized into a string key. Primitive values are JSON-encoded
 * directly. Functions are assigned a stable integer identity via a per-function
 * counter so that the same function reference always produces the same key —
 * avoiding {@link JSON.stringify}'s silent collision where `()=>{}` and
 * `()=>1` both serialize to the same string. Non-plain objects (e.g., class
 * instances with a non-`Object` prototype) cause the cache to be bypassed for
 * that call entirely.
 *
 * ## Error handling
 *
 * Errors are **never** cached. Because errors are thrown rather than returned,
 * a cached {@link Error} object would be returned as a plain value instead of
 * propagating as a thrown exception. The underlying function is therefore
 * re-invoked on every subsequent call with the same arguments whenever the
 * previous call threw.
 *
 * @param fn - The function to memoize. Must be a pure function for correct
 *   results, as the same inputs are assumed to always produce the same output.
 * @returns A memoized version of `fn` with the same signature.
 *
 * @example
 * ```ts
 * const expensive = memo(function compute(x: number): number {
 *   return x * x;
 * });
 *
 * expensive(5); // computed
 * expensive(5); // cached
 * ```
 *
 * @example
 * Passing class instances or non-plain objects bypasses the cache:
 * ```ts
 * const fn = memo(function (instance: MyClass): string {
 *   return instance.toString();
 * });
 * fn(new MyClass()); // always computed (prototype !== Object.prototype)
 * ```
 */
export function memo<T extends (...args: unknown[]) => unknown>(fn: T): T {
  const MAX_CACHE_SIZE = 256;

  const MAX_FN_IDS_SIZE = 1024;

  // Assigns a stable integer identity to each function argument.
  // Uses a regular Map (not WeakMap) so we can track entry count and
  // periodically reset fnCount to prevent unbounded growth.
  const fnIds = new Map<(...args: unknown[]) => unknown, number>();
  let fnCount = 0;

  // Per-fn cache: Map<cacheKey, result>.
  // Map preserves insertion order; delete + re-set moves a key to the end (LRU).
  const fnCache = new Map<string, unknown>();

  return function (this: unknown, ...args: unknown[]): unknown {
    // --- Build cache key ---------------------------------------------------
    const parts: string[] = ["["];
    let skipCache = false;
    for (let i = 0; i < args.length; i++) {
      const v = args[i];
      if (typeof v === "function") {
        const fnArg = v as (...args: unknown[]) => unknown;
        if (!fnIds.has(fnArg)) {
          // Periodically reset to prevent fnCount growing unboundedly when
          // many distinct function references are used as memo arguments.
          if (fnIds.size >= MAX_FN_IDS_SIZE) {
            fnIds.clear();
            fnCount = 0;
          }
          fnIds.set(fnArg, fnCount++);
        }
        parts.push(JSON.stringify(["fn", fnIds.get(fnArg)!]));
      } else if (
        v !== null &&
        typeof v === "object" &&
        Object.getPrototypeOf(v) !== Object.prototype &&
        Object.getPrototypeOf(v) !== null
      ) {
        // Non-plain objects bypass the cache to avoid prototype soup collisions.
        skipCache = true;
        break;
      } else {
        try {
          parts.push(JSON.stringify(v));
        } catch {
          skipCache = true;
          break;
        }
      }
      if (i < args.length - 1) parts.push(",");
    }
    parts.push("]");
    const key = parts.join("");

    // --- Cache lookup (LRU: move to end if present) -----------------------
    // Only check the cache when it's non-empty to avoid an unnecessary Map
    // lookup on every cold-start call when the cache is empty.
    if (!skipCache && fnCache.size > 0 && fnCache.has(key)) {
      const cached = fnCache.get(key);
      // Move to end of insertion order (most recently used).
      fnCache.delete(key);
      fnCache.set(key, cached!);
      return cached;
    }

    // --- Compute -----------------------------------------------------------
    const result = fn.apply(this, args);

    // --- Cache write -------------------------------------------------------
    if (!skipCache && !(result instanceof Error)) {
      if (fnCache.size >= MAX_CACHE_SIZE) {
        // Evict least recently used (first key in insertion order).
        const oldest = fnCache.keys().next().value as string | undefined;
        if (oldest) fnCache.delete(oldest);
      }
      fnCache.set(key, result);
    }

    return result;
  } as T;
}
