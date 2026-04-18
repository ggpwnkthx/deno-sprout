// signals.ts - Reactive signals implementation

/**
 * Currently-executing effect, if any.
 * Signals check this when their .value is read and auto-subscribe.
 */
let currentEffect: EffectHandle | null = null;
let isBatching = false;
// Each entry is a Set of watchers for a single signal
type WatcherSet = Set<EffectHandle>;
const deferredUpdates: WatcherSet[] = [];

export interface EffectHandle {
  /** Re-run the effect function. Called by signals on change. */
  run(): void;
  /** Unsubscribe from all signals this effect depends on. */
  dispose(): void;
  /** @internal */
  _addWatcher?(sig: SignalInternal<unknown>): void;
  /** @internal */
  _watchedSignals?: Set<SignalInternal<unknown>>;
  /** @internal - tracks recursion depth to prevent self-notification */
  _runningDepth?: number;
}

type Unsubscribe = () => void;

export interface Signal<T> {
  value: T;
  subscribe: (fn: () => void) => Unsubscribe;
}

export interface ReadonlySignal<T> {
  value: T;
}

interface SignalInternal<T> extends Signal<T> {
  _removeWatcher(e: EffectHandle): void;
}

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
        // Check each effect's _runningDepth to avoid self-notification
        for (const effect of watchers) {
          if (!effect._runningDepth) {
            effect._runningDepth = 1;
            effect.run();
            effect._runningDepth = 0;
          }
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

export function signal<T>(initial: T): Signal<T> {
  return createSignal(initial);
}

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
      if (!effect._runningDepth) {
        effect._runningDepth = 1;
        effect.run();
        effect._runningDepth = 0;
      }
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
