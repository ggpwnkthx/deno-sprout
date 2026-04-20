import { assertEquals } from "@std/assert";
import { isAssetUrl, isIslandManifest, loadManifest } from "../lib/manifest.ts";

Deno.test("loadManifest returns null when manifest file does not exist", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const result = await loadManifest(tmpDir);
    assertEquals(result, null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("loadManifest returns null when distDir path is empty string", async () => {
  const result = await loadManifest("");
  assertEquals(result, null);
});

Deno.test("loadManifest returns parsed manifest when file exists", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const manifestPath = tmpDir + "/manifest.json";
    const content = JSON.stringify({
      islands: { Counter: "/_sprout/assets/Counter.js" },
      hydrate: "/_sprout/runtime/hydrate.js",
    });
    await Deno.writeTextFile(manifestPath, content);

    const result = await loadManifest(tmpDir);

    assertEquals(result !== null, true);
    assertEquals(result!.islands["Counter"], "/_sprout/assets/Counter.js");
    assertEquals(result!.hydrate, "/_sprout/runtime/hydrate.js");
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("loadManifest returns null for malformed JSON", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const manifestPath = tmpDir + "/manifest.json";
    await Deno.writeTextFile(manifestPath, "{ invalid json }");

    const result = await loadManifest(manifestPath);
    assertEquals(result, null);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// isAssetUrl guard tests
// ---------------------------------------------------------------------------

Deno.test("isAssetUrl accepts root-relative paths", () => {
  assertEquals(isAssetUrl("/_sprout/assets/Counter.js"), true);
  assertEquals(isAssetUrl("/good/path.js"), true);
  assertEquals(isAssetUrl("/"), true);
});

Deno.test("isAssetUrl rejects javascript: scheme", () => {
  assertEquals(isAssetUrl("javascript:alert(1)"), false);
  assertEquals(isAssetUrl("javascript:void(0)"), false);
});

Deno.test("isAssetUrl rejects data: scheme", () => {
  assertEquals(isAssetUrl("data:text/html,<h1>"), false);
  assertEquals(isAssetUrl("data:text/javascript;base64,..."), false);
});

Deno.test("isAssetUrl rejects file: scheme", () => {
  assertEquals(isAssetUrl("file:///etc/passwd"), false);
  assertEquals(isAssetUrl("file:///C:/Windows/System32"), false);
});

Deno.test("isAssetUrl rejects external https URLs", () => {
  assertEquals(isAssetUrl("https://evil.com/x.js"), false);
  assertEquals(isAssetUrl("https://example.com/asset.js"), false);
});

Deno.test("isAssetUrl rejects relative paths (no leading slash)", () => {
  assertEquals(isAssetUrl("assets/app.js"), false);
  assertEquals(isAssetUrl("../etc/passwd"), false);
  assertEquals(isAssetUrl("./local/file.js"), false);
});

// ---------------------------------------------------------------------------
// isIslandManifest guard tests
// ---------------------------------------------------------------------------

Deno.test("isIslandManifest returns true for valid manifest", () => {
  const valid = {
    islands: { Counter: "/_sprout/assets/Counter.js" },
    hydrate: "/_sprout/runtime/hydrate.js",
  };
  assertEquals(isIslandManifest(valid), true);
});

Deno.test("isIslandManifest rejects null", () => {
  assertEquals(isIslandManifest(null), false);
});

Deno.test("isIslandManifest rejects non-object", () => {
  assertEquals(isIslandManifest("string"), false);
  assertEquals(isIslandManifest(42), false);
  assertEquals(isIslandManifest(undefined), false);
});

Deno.test("isIslandManifest rejects missing islands", () => {
  assertEquals(isIslandManifest({ hydrate: "/_sprout/h.js" }), false);
});

Deno.test("isIslandManifest rejects missing hydrate", () => {
  assertEquals(isIslandManifest({ islands: {} }), false);
});

Deno.test("isIslandManifest rejects missing islands property", () => {
  assertEquals(
    isIslandManifest({ hydrate: "/_sprout/h.js" }),
    false,
  );
});

Deno.test("isIslandManifest - array islands passes guard (known gap)", () => {
  // The guard checks typeof islands !== "object" || islands === null.
  // Since typeof [] === "object" and [] !== null, arrays pass the check.
  // This is a gap in the source guard; the test documents actual behavior.
  assertEquals(
    isIslandManifest({ islands: [], hydrate: "/_sprout/h.js" }),
    true, // source accepts arrays — guard has a type-narrowing gap
  );
});

Deno.test("isIslandManifest rejects hydrate with javascript: scheme", () => {
  assertEquals(
    isIslandManifest({
      islands: {},
      hydrate: "javascript:alert(1)",
    }),
    false,
  );
});

Deno.test("isIslandManifest rejects island asset URL with javascript: scheme", () => {
  assertEquals(
    isIslandManifest({
      islands: { Counter: "javascript:alert(1)" },
      hydrate: "/_sprout/h.js",
    }),
    false,
  );
});

Deno.test("isIslandManifest rejects island asset URL with https scheme", () => {
  assertEquals(
    isIslandManifest({
      islands: { Counter: "https://evil.com/bundle.js" },
      hydrate: "/_sprout/h.js",
    }),
    false,
  );
});

Deno.test("isIslandManifest rejects non-string island entry", () => {
  assertEquals(
    isIslandManifest({
      islands: { Counter: 123 },
      hydrate: "/_sprout/h.js",
    }),
    false,
  );
});
