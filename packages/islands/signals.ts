/**
 * @fileoverview Reactive signals implementation for island hydration.
 *
 * Provides a minimal reactive system with:
 * - {@link signal} - writable reactive state
 * - {@link computed} - derived read-only signals
 * - {@link effect} - side effects that auto-track signal dependencies
 * - {@link batch} - grouping multiple signal updates into a single notification
 *
 * ## Subscription model
 *
 * When a {@link signal} is read inside an {@link effect}, the effect is
 * automatically subscribed to that signal. When any subscribed signal's value
 * changes, the effect re-runs. Effects are disposed via their return value.
 *
 * ## Batching
 *
 * {@link batch} defers all change notifications until the batch function
 * completes, then notifies each effect exactly once regardless of how many
 * signals changed.
 */

/**
 * Currently-executing effect, if any.
 * Signals check this when their `.value` is read and auto-subscribe.
 */
let currentEffect: EffectHandle | null = null;
/**
 * When `true`, signal change notifications are deferred and collected into
 * `deferredUpdates` rather than firing immediately.
 */
let isBatching = false;
/**
 * Each entry is a `Set` of watchers for a single signal.
 * Used during batching to collect all affected effects before notifying.
 */
type WatcherSet = Set<EffectHandle>;
/**
 * Collected watcher sets accumulated during a batch.
 * Flushed after the batch function completes.
 */
const deferredUpdates: WatcherSet[] = [];

/**
 * Runs an effect if it is not already running (recursive guard).
 * Used by signal setters and batch flush to prevent self-notification.
 *
 * @param effect - The effect handle to run
 * @internal
 */
function runEffectIfNotRecursing(effect: EffectHandle): void {
  if (!effect._runningDepth) {
    effect._runningDepth = 1;
    effect.run();
    effect._runningDepth = 0;
  }
}

/**
 * Handle returned by {@link effect}, used to manage the effect lifecycle.
 *
 * @template T - The effect handle type (internal use)
 */
export interface EffectHandle {
  /**
   * Re-run the effect function. Called by signals when their value changes.
   */
  run(): void;
  /**
   * Unsubscribe from all signals this effect depends on and clean up.
   */
  dispose(): void;
  /** @internal */
  _addWatcher?(sig: SignalInternal<unknown>): void;
  /** @internal */
  _watchedSignals?: Set<SignalInternal<unknown>>;
  /** @internal Tracks recursion depth to prevent self-notification during effect run. */
  _runningDepth?: number;
}

/**
 * Callback type for unsubscribing from a signal.
 */
type Unsubscribe = () => void;

/**
 * A reactive signal holding a value of type `T`.
 *
 * Signals trigger dependent {@link effect | effects} when their value changes.
 * Reading `.value` inside an effect automatically subscribes that effect.
 *
 * @template T - The value type held by this signal
 */
export interface Signal<T> {
  /** The current value. Reading inside an effect subscribes to changes. */
  value: T;
  /**
   * Subscribe to changes. The callback fires whenever `.value` is set.
   * Returns an unsubscribe function.
   */
  subscribe: (fn: () => void) => Unsubscribe;
}

/**
 * A read-only signal whose value is derived from other signals.
 *
 * Computed signals update automatically when their upstream dependencies change.
 *
 * @template T - The derived value type
 */
export interface ReadonlySignal<T> {
  /** The current derived value. */
  value: T;
}

/**
 * Internal signal interface extending {@link Signal} with watcher management.
 * @template T - The value type
 * @internal
 */
interface SignalInternal<T> extends Signal<T> {
  /**
   * Remove an effect watcher when it disposes.
   * @internal
   */
  _removeWatcher(e: EffectHandle): void;
}

/**
 * Creates a new signal with the given initial value.
 * @template T - The value type
 * @param initial - The initial value for the signal
 * @returns A new {@link Signal} instance
 * @internal
 */
function createSignal<T>(initial: T): SignalInternal<T> {
  let value = initial;
  const watchers = new Set<EffectHandle>();

  const sig = {
    get value() {
      if (
        currentEffect !== null && !isBatching && !currentEffect._runningDepth
      ) {
        watchers.add(currentEffect);
        currentEffect._addWatcher?.(sig);
      }
      return value;
    },
    set value(v: T) {
      value = v;
      if (isBatching) {
        deferredUpdates.push(watchers);
      } else {
        for (const effect of watchers) {
          runEffectIfNotRecursing(effect);
        }
      }
    },
    subscribe(fn: () => void) {
      const handle: EffectHandle = {
        run: fn,
        dispose: () => watchers.delete(handle),
      };
      watchers.add(handle);
      return () => watchers.delete(handle);
    },
    _removeWatcher(e: EffectHandle) {
      watchers.delete(e);
    },
  } as SignalInternal<T>;

  return sig;
}

/**
 * Creates a new reactive signal with the given initial value.
 *
 * ## Example
 * ```ts
 * const count = signal(0);
 * console.log(count.value); // 0
 * count.value = 1; // Triggers all subscribed effects
 * ```
 *
 * @template T - The value type
 * @param initial - The initial value
 * @returns A new {@link Signal} that notifies subscribed effects on change
 */
export function signal<T>(initial: T): Signal<T> {
  return createSignal(initial);
}

/**
 * Creates a read-only derived signal from a computation.
 *
 * The computation runs immediately and re-runs whenever any signal
 * read inside it changes. The returned signal cannot be written to.
 *
 * ## Example
 * ```ts
 * const first = signal("hello");
 * const second = signal("world");
 * const greeting = computed(() => `${first.value} ${second.value}`);
 * console.log(greeting.value); // "hello world"
 * first.value = "hi"; // greeting.value automatically updates
 * ```
 *
 * @template T - The derived value type
 * @param fn - A computation that reads signals and returns a derived value
 * @returns A {@link ReadonlySignal} that updates when dependencies change
 */
export function computed<T>(fn: () => T): ReadonlySignal<T> {
  const result = signal<T>(fn());
  effect(() => {
    result.value = fn();
  });
  return {
    get value() {
      return result.value;
    },
  };
}

/**
 * Groups multiple signal mutations into a single notification batch.
 *
 * All signal changes inside `fn` are collected without notifying
 * effects. After `fn` completes, each affected effect fires exactly once.
 *
 * ## Example
 * ```ts
 * batch(() => {
 *   a.value = 1;
 *   b.value = 2;
 *   c.value = 3;
 * }); // Effects fire once, not three times
 * ```
 *
 * @param fn - Function containing signal mutations
 */
export function batch(fn: () => void): void {
  const prev = currentEffect;
  isBatching = true;
  deferredUpdates.length = 0;
  try {
    fn();
  } finally {
    isBatching = false;
    currentEffect = prev;
    // Flush all deferred notifications
    const allWatchers = new Set<EffectHandle>();
    for (const watchers of deferredUpdates) {
      for (const w of watchers) {
        allWatchers.add(w);
      }
    }
    deferredUpdates.length = 0;
    for (const effect of allWatchers) {
      runEffectIfNotRecursing(effect);
    }
  }
}

/**
 * Run `fn` immediately and re-run it whenever any signal read inside it changes.
 * Returns a dispose function.
 */
export function effect(fn: () => void | (() => void)): () => void {
  let disposed = false;
  let currentCleanup: (() => void) | undefined;

  const effectHandle: EffectHandle = {
    _watchedSignals: new Set<SignalInternal<unknown>>(),
    _addWatcher(sig: SignalInternal<unknown>) {
      this._watchedSignals!.add(sig);
    },
    run() {
      if (disposed) return;
      // Call previous cleanup before re-running
      if (currentCleanup) {
        currentCleanup();
        currentCleanup = undefined;
      }
      const prev = currentEffect;
      currentEffect = this;
      this._runningDepth = 1;
      try {
        for (const sig of this._watchedSignals!) {
          sig.value;
        }
        // _runningDepth must be 0 when fn() runs so signal reads register watchers
        this._runningDepth = 0;
        const result = fn();
        if (typeof result === "function") {
          currentCleanup = result;
        }
      } finally {
        this._runningDepth = 0;
        currentEffect = prev;
      }
    },
    dispose() {
      disposed = true;
      if (currentCleanup) {
        currentCleanup();
        currentCleanup = undefined;
      }
      for (const sig of this._watchedSignals!) {
        sig._removeWatcher(this);
      }
      this._watchedSignals!.clear();
    },
  };

  effectHandle.run();
  return () => effectHandle.dispose();
}
