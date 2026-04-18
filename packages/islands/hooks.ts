// hooks.ts - Island hooks (for client-side)
import {
  computed,
  effect,
  type ReadonlySignal,
  type Signal,
  signal,
} from "./signals.ts";

export function useSignal<T>(initial: T): Signal<T> {
  return signal(initial);
}

export function useComputed<T>(fn: () => T): ReadonlySignal<T> {
  return computed(fn);
}

/**
 * Register a side-effect that re-runs when its signal dependencies change.
 * Automatically disposed when the island is unmounted.
 * Returns a dispose function for manual cleanup.
 */
export function useEffect(fn: () => void | (() => void)): () => void {
  return effect(() => {
    const cleanup = fn();
    return typeof cleanup === "function" ? cleanup : undefined;
  });
}
