// @jsxImportSource @hono/hono
import { assertEquals } from "@std/assert";
import { loadManifest } from "../lib/manifest.ts";

// `loadManifest` reads from a distDir path using json import.
// We test two paths: file does not exist (returns null) and file exists
// (returns parsed manifest). We use a temp directory for the success path.

Deno.test("loadManifest returns null when manifest file does not exist", async () => {
  const result = await loadManifest("/tmp/this-dir-does-not-exist-xyz");
  assertEquals(result, null);
});

Deno.test("loadManifest returns null when distDir path is empty string", async () => {
  const result = await loadManifest("");
  assertEquals(result, null);
});

Deno.test("loadManifest returns parsed manifest when file exists", async () => {
  // Create a temp directory with a valid manifest.json
  const tmpDir = await Deno.makeTempDir();
  const manifestPath = tmpDir + "/manifest.json";
  const content = JSON.stringify({
    islands: { Counter: "/_sprout/assets/Counter.js" },
    hydrate: "/_sprout/runtime/hydrate.js",
  });
  await Deno.writeTextFile(manifestPath, content);

  const result = await loadManifest(tmpDir);

  // Result is not null when file exists
  assertEquals(result !== null, true);
  // loadManifest returns IslandManifest directly (already unwrapped from .default)
  assertEquals(result!.islands["Counter"], "/_sprout/assets/Counter.js");
  assertEquals(result!.hydrate, "/_sprout/runtime/hydrate.js");

  // Cleanup
  await Deno.remove(tmpDir, { recursive: true });
});

Deno.test("loadManifest returns null for malformed JSON", async () => {
  const tmpDir = await Deno.makeTempDir();
  const manifestPath = tmpDir + "/manifest.json";
  await Deno.writeTextFile(manifestPath, "{ invalid json }");

  // loadManifest catches parse errors and returns null
  const result = await loadManifest(tmpDir);
  assertEquals(result, null);

  await Deno.remove(tmpDir, { recursive: true });
});
