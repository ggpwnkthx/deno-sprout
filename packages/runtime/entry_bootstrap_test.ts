// Tests for `scheduleMount` — the pure bootstrap scheduler extracted from
// `runtime_entry.ts`. Because `scheduleMount` is pure and takes the DOM
// surface as a parameter, tests are fully deterministic and require no
// module-caching workarounds.
import { assertEquals } from "jsr:@std/assert@1";
import { type MinimalDocument, scheduleMount } from "./entry_bootstrap.ts";

// ---------------------------------------------------------------------------
// Fake document
// ---------------------------------------------------------------------------

interface FakeDocument extends MinimalDocument {
  _listeners: Map<string, Array<() => void>>;
  _opts: Map<string, { once?: boolean }>;
}

function makeFakeDocument(
  opts: { readyState?: string; addEventListener?: FakeDocument["addEventListener"] },
): FakeDocument {
  const listeners = new Map<string, Array<() => void>>();
  const optsMap = new Map<string, { once?: boolean }>();
  return {
    readyState: opts.readyState ?? "complete",
    addEventListener: opts.addEventListener ??
      ((type: string, fn: () => void, options?: { once?: boolean }) => {
        if (!listeners.has(type)) listeners.set(type, []);
        listeners.get(type)!.push(fn);
        if (options) optsMap.set(type + ":" + fn.toString(), options);
      }),
    _listeners: listeners,
    _opts: optsMap,
  } as unknown as FakeDocument;
}

// Minimal stub ParentNode for `root` tests
const fakeRoot = {
  querySelectorAll: () => [],
} as unknown as ParentNode;

// ---------------------------------------------------------------------------
// Test 1 — No-op when `doc` is undefined and `root` is omitted
// ---------------------------------------------------------------------------
Deno.test("scheduleMount: no-op when doc is undefined and root is omitted", () => {
  let called = false;
  const result = scheduleMount(undefined, undefined, () => {
    called = true;
  });
  assertEquals(result, "noop");
  assertEquals(called, false);
});

// ---------------------------------------------------------------------------
// Test 2 — `root` provided → `queueMicrotask`, run fires
// ---------------------------------------------------------------------------
Deno.test("scheduleMount: root provided schedules via queueMicrotask", async () => {
  let called = false;
  scheduleMount(undefined, fakeRoot, () => {
    called = true;
  });
  assertEquals(called, false);
  await Promise.resolve();
  assertEquals(called, true);
});

// ---------------------------------------------------------------------------
// Test 3 — `doc.readyState === "loading"` → `DOMContentLoaded` binding
// ---------------------------------------------------------------------------
Deno.test("scheduleMount: loading state binds DOMContentLoaded listener", () => {
  const doc = makeFakeDocument({ readyState: "loading" });
  let called = false;
  let capturedListener: (() => void) | undefined;

  const originalAddEventListener = doc.addEventListener.bind(doc);
  doc.addEventListener = (type: string, fn: () => void, options?: { once?: boolean }) => {
    if (type === "DOMContentLoaded") {
      capturedListener = fn;
    }
    originalAddEventListener(type, fn, options);
  };

  const result = scheduleMount(doc, undefined, () => {
    called = true;
  });

  assertEquals(result, "domcontentloaded");
  assertEquals(called, false);
  assertEquals(capturedListener !== undefined, true);

  // Simulate DOMContentLoaded firing
  capturedListener!();
  assertEquals(called, true);
});

// ---------------------------------------------------------------------------
// Test 4 — `doc.readyState === "complete"` → `queueMicrotask`, run fires
// ---------------------------------------------------------------------------
Deno.test("scheduleMount: complete state schedules via queueMicrotask", async () => {
  const doc = makeFakeDocument({ readyState: "complete" });
  let called = false;
  scheduleMount(doc, undefined, () => {
    called = true;
  });
  assertEquals(called, false);
  await Promise.resolve();
  assertEquals(called, true);
  // addEventListener must NOT have been called for "complete" state
  assertEquals(doc._listeners.has("DOMContentLoaded"), false);
});

// ---------------------------------------------------------------------------
// Test 5 — `doc.readyState === "interactive"` → `queueMicrotask`, run fires
// ---------------------------------------------------------------------------
Deno.test("scheduleMount: interactive state schedules via queueMicrotask", async () => {
  const doc = makeFakeDocument({ readyState: "interactive" });
  let called = false;
  scheduleMount(doc, undefined, () => {
    called = true;
  });
  assertEquals(called, false);
  await Promise.resolve();
  assertEquals(called, true);
  assertEquals(doc._listeners.has("DOMContentLoaded"), false);
});

// ---------------------------------------------------------------------------
// Test 6 — `root` provided AND `doc.readyState === "loading"` → root wins
// ---------------------------------------------------------------------------
Deno.test("scheduleMount: root wins over loading doc (microtask)", async () => {
  const doc = makeFakeDocument({ readyState: "loading" });
  let called = false;
  scheduleMount(doc, fakeRoot, () => {
    called = true;
  });
  // Root wins → microtask, not DOMContentLoaded
  assertEquals(called, false);
  await Promise.resolve();
  assertEquals(called, true);
  assertEquals(doc._listeners.has("DOMContentLoaded"), false);
});

// ---------------------------------------------------------------------------
// Test 7 — `doc = undefined` but `root` provided → microtask
// ---------------------------------------------------------------------------
Deno.test("scheduleMount: undefined doc with root still uses microtask", async () => {
  let called = false;
  scheduleMount(undefined, fakeRoot, () => {
    called = true;
  });
  assertEquals(called, false);
  await Promise.resolve();
  assertEquals(called, true);
});
