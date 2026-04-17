// signals.ts - Reactive signals implementation
type Subscriber<T> = (value: T) => void;

export interface Signal<T> {
  value: T;
  subscribe: (fn: Subscriber<T>) => () => void;
}

export interface ReadonlySignal<T> {
  value: T;
}

export function signal<T>(initial: T): Signal<T> {
  let value = initial;
  const subscribers = new Set<Subscriber<T>>();

  return {
    get value() {
      return value;
    },
    set value(v: T) {
      value = v;
      subscribers.forEach((fn) => fn(v));
    },
    subscribe(fn: Subscriber<T>) {
      subscribers.add(fn);
      return () => subscribers.delete(fn);
    },
  };
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  const _sig = signal<T>(fn());
  // Re-compute on dependency change (simplified)
  return {
    get value() {
      return fn();
    },
  };
}

export function batch(fn: () => void): void {
  fn();
}

/**
 * Run a side-effect function immediately and re-run it when its
 * signal dependencies change.
 */
export function effect(fn: () => void): () => void {
  fn();
  // Phase 2+ will implement reactive dependency tracking
  return () => {};
}
