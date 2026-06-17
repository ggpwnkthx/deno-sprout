// Tests for the stale virtual-entry sweep.
//
// Covers:
//   - Old tmp files (>24h) are removed
//   - Fresh tmp files (<24h) are kept
import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";
import { VIRTUAL_ENTRY_DIR } from "./build/esbuild.ts";
import { cleanupStaleVirtualEntries } from "./build/dev_assets.ts";

Deno.test("cleanupStaleVirtualEntries: removes files older than 24h", async () => {
  // Create a file in the real VIRTUAL_ENTRY_DIR
  const testFile = `${VIRTUAL_ENTRY_DIR}/sprout-island-test-stale-${Date.now()}.ts`;
  try {
    await Deno.writeTextFile(testFile, "// test stale entry\n");

    // Deno.utime expects seconds, not milliseconds
    const oldTimeSec = Math.floor((Date.now() - 25 * 60 * 60 * 1000) / 1000);
    await Deno.utime(testFile, oldTimeSec, oldTimeSec);

    // Verify the file exists and has the old mtime
    const staleStat = await Deno.stat(testFile);
    assertExists(staleStat.mtime);
    const staleAgeMs = Date.now() - (staleStat.mtime?.getTime() ?? 0);
    assert(
      staleAgeMs > 24 * 60 * 60 * 1000,
      `staleFile should be >24h old, but age=${staleAgeMs}ms`,
    );

    // Run the sweep
    await cleanupStaleVirtualEntries();

    // Verify the stale file was removed
    let removed = false;
    try {
      await Deno.stat(testFile);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) removed = true;
    }
    assertEquals(removed, true, "stale tmp file should be removed");
  } finally {
    try {
      await Deno.remove(testFile);
    } catch (_cause) {
      // best-effort cleanup
    }
  }
});

Deno.test("cleanupStaleVirtualEntries: keeps files less than 24h old", async () => {
  const testFile = `${VIRTUAL_ENTRY_DIR}/sprout-island-test-fresh-${Date.now()}.ts`;
  try {
    // Write a fresh file (mtime = now)
    await Deno.writeTextFile(testFile, "// test fresh entry\n");

    // Run the sweep
    await cleanupStaleVirtualEntries();

    // Verify the fresh file still exists
    const stat = await Deno.stat(testFile);
    assertExists(stat.mtime);
    const age = Date.now() - (stat.mtime?.getTime() ?? 0);
    assert(age < 60 * 1000, "file should be fresh (< 1 minute old)");
  } finally {
    try {
      await Deno.remove(testFile);
    } catch (_cause) {
      // best-effort cleanup
    }
  }
});
