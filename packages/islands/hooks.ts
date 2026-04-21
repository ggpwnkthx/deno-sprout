/**
 * @fileoverview Island hooks for client-side reactivity.
 *
 * These hooks wrap the core signals API with an ergonomic interface
 * designed for use inside island components. They provide the same
 * functionality as the raw signals exports but with naming that
 * follows React-inspired conventions.
 *
 * All hooks must be called during component initialization or inside
 * an {@link useEffect | effect} callback to ensure proper tracking.
 */

import {
  computed,
  effect,
  type ReadonlySignal,
  type Signal,
  signal,
} from "./signals.ts";

/**
 * Creates a reactive signal with the given initial value.
 *
 * Returns a {@link Signal} that can be read and written imperatively.
 * Reading `.value` inside a {@link useEffect} or another hook
 * automatically creates a reactive dependency.
 *
 * ## Example
 * ```tsx
 * function Counter() {
 *   const count = useSignal(0);
 *   useEffect(() => {
 *     console.log("count changed:", count.value);
 *   });
 *   return <button onClick={() => count.value++}>{count.value}</button>;
 * }
 * ```
 *
 * @template T - The value type
 * @param initial - The initial signal value
 * @returns A reactive {@link Signal}
 */
export function useSignal<T>(initial: T): Signal<T> {
  return signal(initial);
}

/**
 * Creates a read-only derived signal from a computation.
 *
 * The computation re-runs whenever any signal read inside it changes.
 * The returned value cannot be written to directly.
 *
 * ## Example
 * ```tsx
 * function Greeting() {
 *   const first = useSignal("hello");
 *   const second = useSignal("world");
 *   const greeting = useComputed(() => `${first.value} ${second.value}`);
 *   return <p>{greeting.value}</p>;
 * }
 * ```
 *
 * @template T - The derived value type
 * @param fn - Computation that reads other signals and returns a derived value
 * @returns A {@link ReadonlySignal} that updates when dependencies change
 */
export function useComputed<T>(fn: () => T): ReadonlySignal<T> {
  return computed(fn);
}

/**
 * Registers a side-effect that re-runs when its signal dependencies change.
 *
 * The effect function runs immediately on setup, then again whenever any
 * signal read inside it changes. If the effect returns a function, it is
 * called as a cleanup before the effect re-runs or when it is disposed.
 *
 * ## Example
 * ```tsx
 * function Timer() {
 *   const seconds = useSignal(0);
 *   useEffect(() => {
 *     const id = setInterval(() => seconds.value++, 1000);
 *     return () => clearInterval(id); // cleanup
 *   });
 *   return <p>{seconds.value}</p>;
 * }
 * ```
 *
 * @param fn - Side-effect function; may return a cleanup function
 * @returns A dispose function that immediately cleans up the effect
 */
export function useEffect(fn: () => void | (() => void)): () => void {
  return effect(() => {
    const cleanup = fn();
    return typeof cleanup === "function" ? cleanup : undefined;
  });
}
