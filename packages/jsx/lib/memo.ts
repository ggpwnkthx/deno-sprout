// lib/memo.ts - Memoization helper
// Uses a WeakMap keyed by the original function so memoized results are
// cached per-function without leaking memory when the function is GC'd.

export function memo<T extends (...args: unknown[]) => unknown>(fn: T): T {
  // Per-memoized-function identity counter for function arguments.
  // Uses a regular Map since we need to store primitive IDs (numbers).
  // This is per-memoized-function, so it lives as long as the returned
  // memoized function (and the original fn, via closure).
  const fnIds = new Map<(...args: unknown[]) => unknown, number>();
  // Cache: fn → (serialized-key → result)
  const cache = new WeakMap<T, Map<string, unknown>>();
  // Counter for assigning stable integer identities to function arguments.
  let fnCount = 0;

  return function (this: unknown, ...args: unknown[]): unknown {
    // Build a cache key from the arguments. Functions get a stable integer
    // identity via fnIds so that the same function reference always produces
    // the same key (avoiding JSON.stringify's silent collision where
    // `()=>{}` and `()=>1` both serialize to the same key). Non-plain
    // objects or JSON.stringify failures cause skipCache=true, bypassing
    // the cache entirely for this call.
    let skipCache = false;
    let key = "[";
    for (let i = 0; i < args.length; i++) {
      const v = args[i];
      if (typeof v === "function") {
        // Cast to the narrower function type that matches fnIds' key type,
        // since TypeScript's typeof narrowing gives the broad Function type.
        const fnArg = v as (...args: unknown[]) => unknown;
        if (!fnIds.has(fnArg)) {
          fnIds.set(fnArg, fnCount++);
        }
        key += JSON.stringify(["fn", fnIds.get(fnArg)!]);
      } else if (
        v !== null && typeof v === "object" &&
        Object.getPrototypeOf(v) !== Object.prototype &&
        Object.getPrototypeOf(v) !== null
      ) {
        skipCache = true;
      } else {
        try {
          key += JSON.stringify(v);
        } catch {
          skipCache = true;
        }
      }
      if (i < args.length - 1) key += ",";
    }
    key += "]";

    let fnCache: Map<string, unknown> | undefined;

    if (!skipCache) {
      if (!cache.has(fn)) {
        fnCache = new Map<string, unknown>();
        cache.set(fn, fnCache);
      } else {
        fnCache = cache.get(fn)!;
      }

      if (fnCache.has(key)) {
        return fnCache.get(key);
      }
    }

    const result = fn.apply(this, args);

    // Only cache successful results. Errors are never cached because they are
    // thrown (not returned), so a cached Error object would be returned as a
    // plain value instead of propagating as a thrown exception. This ensures
    // `fn.apply` is invoked on every subsequent call with the same arguments.
    if (!skipCache && !(result instanceof Error)) {
      fnCache?.set(key, result);
    }
    return result;
  } as unknown as T;
}
