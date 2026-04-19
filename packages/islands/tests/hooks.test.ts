// hooks_test.ts - Tests for hooks (useSignal, useComputed, useEffect)
import { assertEquals } from "@std/assert";
import { useComputed, useEffect, useSignal } from "../hooks.ts";
import type { Signal } from "../signals.ts";

Deno.test("useSignal: returns a signal with the correct initial value", () => {
  const s = useSignal(42);
  assertEquals(s.value, 42);
});

Deno.test("useSignal: setting .value triggers subscribers", () => {
  const s = useSignal(0);
  let calls = 0;
  s.subscribe(() => {
    calls++;
  });
  s.value = 1;
  assertEquals(calls, 1);
  s.value = 2;
  assertEquals(calls, 2);
});

Deno.test("useSignal: subscriber is called every time .value is set (even to same value)", () => {
  const s = useSignal(0);
  let calls = 0;
  s.subscribe(() => {
    calls++;
  });
  s.value = 1;
  assertEquals(calls, 1);
  s.value = 1; // same value still triggers — no equality check in setter
  assertEquals(calls, 2);
});

Deno.test("useSignal: returns the correct type (Signal<T>)", () => {
  const s = useSignal("hello") as Signal<string>;
  assertEquals(typeof s.value, "string");
  assertEquals(typeof s.subscribe, "function");
});

Deno.test("useComputed: returns a readonly signal", () => {
  const s = useSignal(1);
  const comp = useComputed(() => s.value * 2);
  // @ts-ignore - value property exists but is readonly
  assertEquals(typeof comp.value, "number");
});

Deno.test("useComputed: the computed value is derived correctly from the input signal", () => {
  const s = useSignal(3);
  const comp = useComputed(() => s.value + 5);
  assertEquals(comp.value, 8);
  s.value = 10;
  assertEquals(comp.value, 15);
});

Deno.test("useComputed: updates when the dependency signal changes", () => {
  const s = useSignal(1);
  const comp = useComputed(() => s.value * 2);
  assertEquals(comp.value, 2);
  s.value = 5;
  assertEquals(comp.value, 10);
  s.value = 20;
  assertEquals(comp.value, 40);
});

// Note: useComputed uses an internal effect that re-runs when dependencies change.
// The computed value is not re-computed on every .value read, but the effect
// itself runs on dependency changes, not on reads. Memoization is at the effect level.

Deno.test("useEffect: runs immediately and re-runs on dependency change", () => {
  const trigger = useSignal(0);
  let runCount = 0;
  const stop = useEffect(() => {
    runCount = trigger.value;
  });
  assertEquals(runCount, 0);
  trigger.value = 5;
  assertEquals(runCount, 5);
  trigger.value = 10;
  assertEquals(runCount, 10);
  stop();
});

Deno.test("useEffect: cleanup is called on re-run", () => {
  const trigger = useSignal(0);
  let cleanupCalls = 0;
  const stop = useEffect(() => {
    void trigger.value;
    return () => {
      cleanupCalls++;
    };
  });
  assertEquals(cleanupCalls, 0);
  trigger.value = 1;
  assertEquals(cleanupCalls, 1);
  trigger.value = 2;
  assertEquals(cleanupCalls, 2);
  stop();
});

Deno.test("useEffect: cleanup called on dispose", () => {
  const s = useSignal(0);
  let cleanupCalled = false;
  const stop = useEffect(() => {
    void s.value;
    return () => {
      cleanupCalled = true;
    };
  });
  assertEquals(cleanupCalled, false);
  stop();
  assertEquals(cleanupCalled, true);
});
