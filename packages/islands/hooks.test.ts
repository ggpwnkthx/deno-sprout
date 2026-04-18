// hooks_test.ts - Tests for useSignal, useComputed, useEffect
import { assertEquals } from "@std/assert";
import { useComputed, useEffect, useSignal } from "./hooks.ts";

Deno.test("useSignal: returns signal with correct initial value", () => {
  const sig = useSignal(0);
  assertEquals(sig.value, 0);
  sig.value = 5;
  assertEquals(sig.value, 5);
});

Deno.test("useComputed: updates when dependency changes", () => {
  const count = useSignal(1);
  const doubled = useComputed(() => count.value * 2);
  assertEquals(doubled.value, 2);
  count.value = 3;
  assertEquals(doubled.value, 6);
});

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
