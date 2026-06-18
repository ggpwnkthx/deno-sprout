// Tests for `mountAll` and the per-island mount flow.
//
// We use a fake element + parent node that implements the minimal DOM
// surface `mountAll` and `mountIsland` touch. The dynamic importer is
// injected so the tests do not hit the network. The runtime never
// observes the real DOM in these tests; the DOM-level rendering path
// is covered by `mount_component_test.ts` with an injected render
// function.
//
// The fake types are structural but do not extend `HTMLElement` /
// `ParentNode`; we cast at the call site so the runtime's typed
// signatures are exercised without standing up a DOM.
import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { mountAll } from "./mount_all.ts";
import type { IslandMountResult } from "./module_contract.ts";
import { RuntimeError } from "./errors.ts";
import {
  asParent,
  type FakeElement,
  fakeImporter,
  fakeIsland,
  makeElement,
  makeIslandElement,
  makeParent,
} from "./_test_utils.ts";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

Deno.test("mountAll calls querySelectorAll with the exact selector [data-sprout-src]", async () => {
  const parent = makeParent();
  const a = makeIslandElement("A", "/@sprout/island/A.js");
  parent.addIsland(a);

  const calls: string[] = [];
  const orig = parent.querySelectorAll.bind(parent);
  parent.querySelectorAll = (selector: string) => {
    calls.push(selector);
    return orig(selector);
  };

  const moduleA = fakeIsland();
  const importer = fakeImporter({
    "/@sprout/island/A.js": { default: moduleA },
  });
  await mountAll(asParent(parent), { importer });
  assertEquals(calls.length, 1);
  assertEquals(calls[0], "[data-sprout-src]");
});

Deno.test("mountAll passes the src attribute verbatim to the importer", async () => {
  const parent = makeParent();
  const weirdSrc = "/@sprout/island/WeirdPath_123.js";
  const a = makeIslandElement("A", weirdSrc);
  parent.addIsland(a);

  let capturedSpecifier: string | undefined;
  const importer = (specifier: string) => {
    capturedSpecifier = specifier;
    return Promise.resolve({ default: fakeIsland() });
  };
  await mountAll(asParent(parent), { importer });
  assertEquals(capturedSpecifier, weirdSrc);
});

Deno.test("mountAll mounts all placeholders and returns one result per node", async () => {
  const parent = makeParent();
  const a = makeIslandElement("A", "/@sprout/island/A.js", { initial: 1 });
  const b = makeIslandElement("B", "/@sprout/island/B.js", {});
  parent.addIsland(a);
  parent.addIsland(b);

  const moduleA = fakeIsland();
  const moduleB = fakeIsland();
  const importer = fakeImporter({
    "/@sprout/island/A.js": { default: moduleA },
    "/@sprout/island/B.js": { default: moduleB },
  });

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 2);
  const r0 = results[0];
  const r1 = results[1];
  if (r0 === undefined || r1 === undefined) throw new Error("expected two results");
  assertEquals(r0.ok, true);
  assertEquals(r1.ok, true);
  if (r0.ok && r1.ok) {
    assertEquals(r0.id, "A");
    assertEquals(r1.id, "B");
  }
  assertEquals(a.getAttribute("data-sprout-mounted"), "true");
  assertEquals(b.getAttribute("data-sprout-mounted"), "true");
  assertEquals(moduleA.callCount, 1);
  assertEquals(moduleB.callCount, 1);
});

Deno.test("mountAll skips already-mounted nodes and is idempotent", async () => {
  const parent = makeParent();
  const a = makeIslandElement("A", "/@sprout/island/A.js");
  parent.addIsland(a);

  const moduleA = fakeIsland();
  const importer = fakeImporter({
    "/@sprout/island/A.js": { default: moduleA },
  });

  const first = await mountAll(asParent(parent), { importer: importer });
  const r0 = first[0];
  if (r0 === undefined) throw new Error("expected one result");
  assertEquals(r0.ok, true);
  assertEquals(moduleA.callCount, 1);

  const second = await mountAll(asParent(parent), { importer: importer });
  // Still resolves to a result for the same node, but the fake island
  // is not invoked a second time.
  assertEquals(second.length, 1);
  const r1 = second[0];
  if (r1 === undefined) throw new Error("expected one result");
  assertEquals(r1.ok, true);
  assertEquals(moduleA.callCount, 1);
});

Deno.test("mountAll marks invalid src with data-sprout-error and returns a failure", async () => {
  const parent = makeParent();
  const bad = makeIslandElement("Bad", "/@sprout/../bad.js");
  parent.addIsland(bad);
  const importer = fakeImporter({});

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 1);
  const r = results[0];
  if (r === undefined) throw new Error("expected one result");
  if (r.ok) throw new Error("expected failure");
  assertEquals(r.error.code, "INVALID_PLACEHOLDER");
  assertEquals(bad.getAttribute("data-sprout-error"), "INVALID_PLACEHOLDER");
});

Deno.test("mountAll rejects src with a non-canonical scheme", async () => {
  const parent = makeParent();
  const bad = makeIslandElement("Evil", "http://evil.example/x.js");
  parent.addIsland(bad);
  const importer = fakeImporter({});

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 1);
  const r = results[0];
  if (r === undefined) throw new Error("expected one result");
  if (r.ok) throw new Error("expected failure");
  assertEquals(r.error.code, "INVALID_PLACEHOLDER");
  assertEquals(bad.getAttribute("data-sprout-error"), "INVALID_PLACEHOLDER");
});

Deno.test("mountAll rejects src missing the .js extension", async () => {
  const parent = makeParent();
  const bad = makeIslandElement("NoExt", "/@sprout/island/Counter");
  parent.addIsland(bad);
  const importer = fakeImporter({});

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 1);
  const r = results[0];
  if (r === undefined) throw new Error("expected one result");
  if (r.ok) throw new Error("expected failure");
  assertEquals(r.error.code, "INVALID_PLACEHOLDER");
  assertEquals(bad.getAttribute("data-sprout-error"), "INVALID_PLACEHOLDER");
});

Deno.test("mountAll marks invalid props with data-sprout-error and returns a failure", async () => {
  const parent = makeParent();
  const a = makeIslandElement("A", "/@sprout/island/A.js");
  a.setAttribute("data-sprout-props", "not json");
  parent.addIsland(a);
  const importer = fakeImporter({});

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 1);
  const r = results[0];
  if (r === undefined) throw new Error("expected one result");
  if (r.ok) throw new Error("expected failure");
  assertEquals(r.error.code, "INVALID_PROPS");
  assertEquals(r.error.details.reason, "json_parse");
  assertEquals(a.getAttribute("data-sprout-error"), "INVALID_PROPS");
});

Deno.test("mountAll reports a failed dynamic import", async () => {
  const parent = makeParent();
  const a = makeIslandElement("A", "/@sprout/island/Missing.js");
  parent.addIsland(a);
  const importer = (specifier: string) => Promise.reject(new Error(`network down: ${specifier}`));

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 1);
  const r = results[0];
  if (r === undefined) throw new Error("expected one result");
  if (r.ok) throw new Error("expected failure");
  assertEquals(r.error.code, "MOUNT_FAILED");
  assertEquals(a.getAttribute("data-sprout-error"), "MOUNT_FAILED");
});

Deno.test("mountAll reports a module without a mount function", async () => {
  const parent = makeParent();
  const a = makeIslandElement("A", "/@sprout/island/Empty.js");
  parent.addIsland(a);
  // Resolves successfully, but the default export has no `mount`.
  const importer = (_specifier: string) => Promise.resolve({ default: { unrelated: true } });

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 1);
  const r = results[0];
  if (r === undefined) throw new Error("expected one result");
  if (r.ok) throw new Error("expected failure");
  assertEquals(r.error.code, "MOUNT_FAILED");
  assertEquals(a.getAttribute("data-sprout-error"), "MOUNT_FAILED");
  assertStringIncludes(r.error.message, "mount");
});

Deno.test("mountAll reports a mount function that throws", async () => {
  const parent = makeParent();
  const a = makeIslandElement("A", "/@sprout/island/Boom.js");
  parent.addIsland(a);
  const importer = (_specifier: string) =>
    Promise.resolve({
      default: {
        mount() {
          throw new Error("kaboom");
        },
      },
    });

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 1);
  const r = results[0];
  if (r === undefined) throw new Error("expected one result");
  if (r.ok) throw new Error("expected failure");
  assertEquals(r.error.code, "MOUNT_FAILED");
  assertEquals(a.getAttribute("data-sprout-error"), "MOUNT_FAILED");
  assertStringIncludes(r.error.message, "kaboom");
});

Deno.test("mountAll continues after a failure and mounts the later placeholders", async () => {
  const parent = makeParent();
  const a = makeIslandElement("A", "/@sprout/island/A.js");
  const bad = makeIslandElement("Bad", "/@sprout/../bad.js");
  const c = makeIslandElement("C", "/@sprout/island/C.js");
  parent.addIsland(a);
  parent.addIsland(bad);
  parent.addIsland(c);

  const moduleA = fakeIsland();
  const moduleC = fakeIsland();
  const importer = fakeImporter({
    "/@sprout/island/A.js": { default: moduleA },
    "/@sprout/island/C.js": { default: moduleC },
  });

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 3);
  const r0 = results[0];
  const r1 = results[1];
  const r2 = results[2];
  if (r0 === undefined || r1 === undefined || r2 === undefined) {
    throw new Error("expected three results");
  }
  assertEquals(r0.ok, true);
  assertEquals(r1.ok, false);
  assertEquals(r2.ok, true);
  assertEquals(a.getAttribute("data-sprout-mounted"), "true");
  assertEquals(c.getAttribute("data-sprout-mounted"), "true");
  assertEquals(bad.getAttribute("data-sprout-error"), "INVALID_PLACEHOLDER");
  assertEquals(moduleA.callCount, 1);
  assertEquals(moduleC.callCount, 1);
});

Deno.test("mountAll scans nested placeholders inside the root", async () => {
  const parent = makeParent();
  const wrapper = makeElement();
  wrapper.setAttribute("data-sprout-island", "Wrapper");
  wrapper.setAttribute("data-sprout-src", "/@sprout/island/Wrapper.js");
  const child = makeElement();
  child.setAttribute("data-sprout-island", "Child");
  child.setAttribute("data-sprout-src", "/@sprout/island/Child.js");
  wrapper.appendChild(child);
  parent.addIsland(wrapper);

  const wrapperModule = fakeIsland();
  const childModule = fakeIsland();
  const importer = fakeImporter({
    "/@sprout/island/Wrapper.js": { default: wrapperModule },
    "/@sprout/island/Child.js": { default: childModule },
  });

  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 2);
  assertEquals(results.every((r: IslandMountResult) => r.ok), true);
  assertEquals(wrapper.getAttribute("data-sprout-mounted"), "true");
  assertEquals(child.getAttribute("data-sprout-mounted"), "true");
});

Deno.test("mountAll with no root in a non-DOM environment throws MOUNT_FAILED", async () => {
  // Temporarily hide `document` by assigning undefined on globalThis
  // for the test. The runtime's `defaultRoot` reads `document` from
  // the global, so this simulates a non-browser host.
  const saved = (globalThis as { document?: unknown }).document;
  try {
    (globalThis as { document?: unknown }).document = undefined;
    let caught: unknown;
    try {
      await mountAll();
    } catch (e) {
      caught = e;
    }
    if (!(caught instanceof RuntimeError)) {
      throw new Error("expected RuntimeError when document is unavailable");
    }
    assertEquals(caught.code, "MOUNT_FAILED");
  } finally {
    (globalThis as { document?: unknown }).document = saved;
  }
});

Deno.test("mountAll handles async mount that resolves successfully", async () => {
  const parent = makeParent();
  const a = makeIslandElement("AsyncOk", "/@sprout/island/AsyncOk.js");
  parent.addIsland(a);
  const importer = (_specifier: string) =>
    Promise.resolve({
      default: {
        mount(element: FakeElement, _props: Readonly<Record<string, unknown>>) {
          return new Promise<void>((resolve) => {
            queueMicrotask(() => {
              element.setAttribute("data-sprout-mounted", "true");
              resolve();
            });
          });
        },
      },
    });
  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 1);
  const r = results[0];
  if (r === undefined) throw new Error("expected one result");
  assertEquals(r.ok, true, "mount result should be ok");
  assertEquals(a.getAttribute("data-sprout-mounted"), "true");
});

Deno.test("mountAll handles async mount that rejects", async () => {
  const parent = makeParent();
  const a = makeIslandElement("AsyncFail", "/@sprout/island/AsyncFail.js");
  parent.addIsland(a);
  const importer = (_specifier: string) =>
    Promise.resolve({
      default: {
        mount() {
          return Promise.reject(new Error("async boom"));
        },
      },
    });
  const results = await mountAll(asParent(parent), { importer: importer });
  assertEquals(results.length, 1);
  const r = results[0];
  if (r === undefined) throw new Error("expected one result");
  if (r.ok) throw new Error("expected failure result");
  assertEquals(r.error.code, "MOUNT_FAILED");
  assertStringIncludes(r.error.message, "async boom");
  assertEquals(a.getAttribute("data-sprout-error"), "MOUNT_FAILED");
  assertEquals(a.getAttribute("data-sprout-mounted"), null);
});
