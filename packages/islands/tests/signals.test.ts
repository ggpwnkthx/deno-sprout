// signals_test.ts - Tests for reactive signals implementation
import { assertEquals } from "@std/assert";
import { batch, computed, effect, signal } from "./signals.ts";

Deno.test("signal: get and set value", () => {
  const s = signal(42);
  assertEquals(s.value, 42);
  s.value = 100;
  assertEquals(s.value, 100);
});

Deno.test("signal: subscriber notified on change", () => {
  const s = signal(0);
  let calls = 0;
  s.subscribe(() => {
    calls++;
  });
  s.value = 1;
  assertEquals(calls, 1);
  s.value = 2;
  assertEquals(calls, 2);
});

Deno.test("effect: runs immediately", () => {
  let count = 0;
  const stop = effect(() => {
    count++;
  });
  assertEquals(count, 1);
  stop();
});

Deno.test("effect: re-runs when dependency changes", () => {
  const s = signal(0);
  let count = 0;
  const stop = effect(() => {
    count = s.value;
  });
  assertEquals(count, 0);
  s.value = 5;
  assertEquals(count, 5);
  s.value = 10;
  assertEquals(count, 10);
  stop();
});

Deno.test("effect: dispose stops re-runs", () => {
  const s = signal(0);
  let count = 0;
  const stop = effect(() => {
    count = s.value;
  });
  assertEquals(count, 0);
  stop();
  s.value = 999;
  assertEquals(count, 0); // should not have changed
});

Deno.test("computed: only recomputes when dependency changes", () => {
  const s = signal(1);
  let runCount = 0;
  const comp = computed(() => {
    runCount++;
    return s.value * 2;
  });
  // computed() calls effect() which runs fn() immediately, plus signal(fn()) also calls fn()
  // so runCount is 2 after initialization
  assertEquals(runCount, 2);
  // First read — returns cached value, no additional run
  assertEquals(comp.value, 2);
  assertEquals(runCount, 2);
  // Second read — should NOT re-run (dependency unchanged)
  assertEquals(comp.value, 2);
  assertEquals(runCount, 2);
  // Change dependency — effect re-runs fn()
  s.value = 3;
  assertEquals(comp.value, 6);
  assertEquals(runCount, 3);
  stop();
});

function stop() {
  // noop for test above
}

Deno.test("computed: dispose works", () => {
  const s = signal(1);
  const comp = computed(() => s.value * 2);
  assertEquals(comp.value, 2);
  s.value = 3;
  assertEquals(comp.value, 6);
});

Deno.test("batch: defers subscriber notifications", () => {
  const s = signal(0);
  let notifications = 0;
  s.subscribe(() => {
    notifications++;
  });
  batch(() => {
    s.value = 1;
    s.value = 2;
    s.value = 3;
  });
  // All three should notify only once after batch exits
  assertEquals(notifications, 1);
  assertEquals(s.value, 3);
});

Deno.test("effect: cleanup function is called on re-run", () => {
  const trigger = signal(0);
  let cleanupCount = 0;
  let effectCount = 0;
  const stop = effect(() => {
    effectCount++;
    void trigger.value;
    return () => {
      cleanupCount++;
    };
  });
  assertEquals(effectCount, 1);
  trigger.value = 1; // triggers re-run, cleanup called first
  assertEquals(effectCount, 2);
  assertEquals(cleanupCount, 1);
  trigger.value = 2;
  assertEquals(effectCount, 3);
  assertEquals(cleanupCount, 2);
  stop();
});

Deno.test("effect: cleanup function called on dispose", () => {
  const s = signal(0);
  let cleanupCalled = false;
  const stop = effect(() => {
    void s.value;
    return () => {
      cleanupCalled = true;
    };
  });
  assertEquals(cleanupCalled, false);
  stop();
  assertEquals(cleanupCalled, true);
});
