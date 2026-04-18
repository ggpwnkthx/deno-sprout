// manifest_test.ts - Tests for manifest functions
import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import {
  buildManifest,
  contentHash,
  readManifest,
  writeManifest,
} from "../manifest.ts";

Deno.test("contentHash - returns 8-character lowercase hex string", async () => {
  const bytes = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
  const hash = await contentHash(bytes);

  assertEquals(hash.length, 8);
  assertEquals(hash, hash.toLowerCase());
  // All characters should be valid hex
  assertEquals(/^[a-f0-9]+$/.test(hash), true);
});

Deno.test("contentHash - two identical byte arrays produce same hash", async () => {
  const bytes1 = new Uint8Array([104, 101, 108, 108, 111]);
  const bytes2 = new Uint8Array([104, 101, 108, 108, 111]);

  const hash1 = await contentHash(bytes1);
  const hash2 = await contentHash(bytes2);

  assertEquals(hash1, hash2);
});

Deno.test("buildManifest - returns correct island URLs with hash", async () => {
  const islands = { Counter: "console.log(1)" };

  const manifest = await buildManifest(islands);

  assertExists(manifest.islands["Counter"]);
  assertStringIncludes(
    manifest.islands["Counter"],
    "/_sprout/islands/Counter.",
  );
  assertStringIncludes(manifest.islands["Counter"], ".js");
});

Deno.test("buildManifest - hydrate URL is always unhashed", async () => {
  const manifest = await buildManifest({});

  assertEquals(manifest.hydrate, "/_sprout/hydrate.js");
});

Deno.test("writeManifest and readManifest - roundtrip", async () => {
  const tempDir = await Deno.makeTempDir();
  const manifest = await buildManifest({ Counter: "console.log(1)" });

  await writeManifest(manifest, tempDir);

  const read = await readManifest(tempDir);
  assertExists(read);
  assertEquals(read!.islands["Counter"], manifest.islands["Counter"]);
  assertEquals(read!.hydrate, manifest.hydrate);

  // Cleanup
  await Deno.remove(tempDir, { recursive: true });
});

Deno.test("readManifest - returns null when file absent", async () => {
  const result = await readManifest("/nonexistent/path");

  assertEquals(result, null);
});

Deno.test("generateAssetManifest - is an alias for buildManifest", async () => {
  // @ts-ignore: test that the export exists
  const { generateAssetManifest } = await import("../mod.ts");
  assertExists(generateAssetManifest);

  const islands = { Counter: "console.log(1)", Timer: "console.log(2)" };
  const result = await generateAssetManifest(islands);

  // Same expected output as buildManifest
  assertExists(result.islands["Counter"]);
  assertExists(result.islands["Timer"]);
  assertEquals(result.hydrate, "/_sprout/hydrate.js");
  assertStringIncludes(result.islands["Counter"], "/_sprout/islands/Counter.");
  assertStringIncludes(result.islands["Counter"], ".js");
  assertStringIncludes(result.islands["Timer"], "/_sprout/islands/Timer.");
  assertStringIncludes(result.islands["Timer"], ".js");
});
