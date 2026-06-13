// Tests for the M7 bounded LRU (`server/lru.ts`).
//
// The LRU is the resident-memory cap for the production-serve
// frozen asset cache. The invariants to test are:
//
//   - LRU eviction order: least-recently-used first.
//   - `get` promotes the entry to most-recently-used.
//   - `set` updates both the value and the byte size when the
//     key is already present.
//   - `clear` resets the state to empty.
//   - The cap is never exceeded after `set` returns.
//   - `set` with `size: 0` records the entry as present (so
//     `has` / `get` hit) without contributing to the byte
//     budget.
//   - Constructor validates `maxBytes`.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { BoundedLru } from "./lru.ts";

Deno.test("BoundedLru: empty cache has zero size and count", () => {
  const lru = new BoundedLru<string, string>(1024);
  assertEquals(lru.size, 0);
  assertEquals(lru.count, 0);
  assertEquals(lru.has("a"), false);
  assertEquals(lru.get("a"), undefined);
});

Deno.test("BoundedLru: set + get round-trip", () => {
  const lru = new BoundedLru<string, string>(1024);
  lru.set("a", "alpha", 4);
  assertEquals(lru.get("a"), "alpha");
  assertEquals(lru.size, 4);
  assertEquals(lru.count, 1);
});

Deno.test("BoundedLru: get promotes the entry to most-recently-used", () => {
  const lru = new BoundedLru<string, string>(1024);
  lru.set("a", "alpha", 4);
  lru.set("b", "beta", 4);
  lru.set("c", "gamma", 4);
  // Read "a" — should be the most-recently-used after this.
  lru.get("a");
  // Iterating yields a, c, b (a last because we promoted it).
  // Walk the underlying map's order via Symbol.iterator.
  const order: string[] = [];
  for (const [k] of lru) order.push(k);
  assertEquals(order, ["b", "c", "a"]);
});

Deno.test("BoundedLru: set with an existing key updates the value and the size", () => {
  const lru = new BoundedLru<string, string>(1024);
  lru.set("a", "alpha", 4);
  assertEquals(lru.size, 4);
  lru.set("a", "alphabet", 8);
  assertEquals(lru.size, 8);
  assertEquals(lru.count, 1);
  assertEquals(lru.get("a"), "alphabet");
});

Deno.test("BoundedLru: set with an existing key whose size drops below the cap stays", () => {
  // Re-setting with a smaller size must subtract the OLD size
  // (not the new size) from the running total. A regression on
  // this path would silently leak bytes and is hard to spot in
  // production.
  const lru = new BoundedLru<string, Uint8Array>(100);
  lru.set("a", new Uint8Array(80), 80);
  lru.set("a", new Uint8Array(20), 20);
  assertEquals(lru.size, 20);
  assertEquals(lru.count, 1);
});

Deno.test("BoundedLru: evicts least-recently-used when over capacity", () => {
  const lru = new BoundedLru<string, number>(10);
  lru.set("a", 1, 4);
  lru.set("b", 2, 4);
  lru.set("c", 3, 4); // total = 12, over cap 10
  // "a" should have been evicted.
  assertEquals(lru.has("a"), false);
  assertEquals(lru.has("b"), true);
  assertEquals(lru.has("c"), true);
  assertEquals(lru.size, 8);
  assertEquals(lru.count, 2);
});

Deno.test("BoundedLru: size never exceeds maxBytes after set returns", () => {
  // The invariant the spec pins. We set entries whose total
  // grows past the cap and assert the size never goes over.
  const lru = new BoundedLru<string, number>(50);
  for (let i = 0; i < 20; i++) {
    lru.set(`k${i}`, i, 10);
    assert(
      lru.size <= 50,
      `size ${lru.size} exceeded cap 50 after set k${i}`,
    );
  }
});

Deno.test("BoundedLru: clear resets the state", () => {
  const lru = new BoundedLru<string, number>(1024);
  lru.set("a", 1, 100);
  lru.set("b", 2, 100);
  assertEquals(lru.count, 2);
  lru.clear();
  assertEquals(lru.count, 0);
  assertEquals(lru.size, 0);
  assertEquals(lru.has("a"), false);
  assertEquals(lru.has("b"), false);
});

Deno.test("BoundedLru: set with size 0 still counts the entry as present", () => {
  // The spec calls out this case: a `size: 0` entry should be
  // present (so `has` / `get` hit) without contributing to the
  // byte budget.
  const lru = new BoundedLru<string, string>(1024);
  lru.set("a", "alpha", 0);
  assertEquals(lru.size, 0);
  assertEquals(lru.has("a"), true);
  assertEquals(lru.get("a"), "alpha");
});

Deno.test("BoundedLru: delete returns true on a present key, false otherwise", () => {
  const lru = new BoundedLru<string, number>(1024);
  lru.set("a", 1, 4);
  assertEquals(lru.delete("a"), true);
  assertEquals(lru.has("a"), false);
  assertEquals(lru.size, 0);
  assertEquals(lru.delete("a"), false);
});

Deno.test("BoundedLru: delete decrements the byte total", () => {
  const lru = new BoundedLru<string, number>(1024);
  lru.set("a", 1, 100);
  lru.set("b", 2, 50);
  assertEquals(lru.size, 150);
  lru.delete("a");
  assertEquals(lru.size, 50);
  assertEquals(lru.count, 1);
});

Deno.test("BoundedLru: single oversized entry is kept (honest cap)", () => {
  // When a single entry's size exceeds the cap, the spec keeps
  // it in the cache rather than silently dropping it. The
  // invariant `size <= maxBytes` is allowed to break for this
  // edge case so the LRU does not become a "this entry is
  // missing" footgun for callers.
  const lru = new BoundedLru<string, number>(10);
  lru.set("big", 1, 100);
  assertEquals(lru.has("big"), true);
  assertEquals(lru.get("big"), 1);
});

Deno.test("BoundedLru: maxBytes < 0 throws RangeError", () => {
  assertThrows(
    () => new BoundedLru<string, string>(-1),
    RangeError,
  );
});

Deno.test("BoundedLru: maxBytes = 0 accepts entries; evicts to keep size at 0", () => {
  // A cap of 0 is allowed. The LRU should evict the previous
  // entry whenever a new one is set, keeping `size` at 0.
  const lru = new BoundedLru<string, number>(0);
  lru.set("a", 1, 1); // size goes to 1
  // Single oversized entry is kept, so the cap invariant is
  // not enforced on a 0-cap with a 1-byte value. That is the
  // documented "honest cap" edge case.
  assertEquals(lru.has("a"), true);
  lru.set("b", 2, 1);
  // Adding "b" evicts the LRU (which is "a" in this case) and
  // keeps "b" present.
  assertEquals(lru.has("a"), false);
  assertEquals(lru.has("b"), true);
});

Deno.test("BoundedLru: maxBytes is exposed via the maxBytes getter", () => {
  const lru = new BoundedLru<string, number>(42);
  assertEquals(lru.maxBytes, 42);
});

Deno.test("BoundedLru: negative set size throws RangeError", () => {
  const lru = new BoundedLru<string, number>(1024);
  assertThrows(
    () => lru.set("a", 1, -1),
    RangeError,
  );
});
