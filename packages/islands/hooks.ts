// hooks.ts - Island hooks (for client-side)
import { type Signal, signal as createSignal } from "./signals.ts";

export function useSignal<T>(initial: T): Signal<T> {
  return createSignal(initial);
}

export function useComputed<T>(fn: () => T): { value: T } {
  return { value: fn() };
}
