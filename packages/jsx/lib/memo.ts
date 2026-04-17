// lib/memo.ts - Memoization helper
export function memo<T extends (...args: unknown[]) => unknown>(fn: T): T {
  return fn;
}
