// M8 hardening tests for `@sprout/core` path validation.
//
// The server package owns three HTTP-time path validators:
//
//   - `resolvePublicFile` maps a request URL path to a file under
//     `publicDir`. It rejects NUL bytes, `..` segments, and any
//     URL under the reserved `/@sprout/` namespace.
//   - `serveStaticFile` is the byte-streaming helper for the
//     resolved file. It throws `STATIC_FILE_OUTSIDE_ROOT` when
//     called with a path that is not under the public root.
//   - `serveDevAsset` and `serveFrozenAsset` carry the framework
//     asset route handlers. They enforce the `/@sprout/`
//     namespace at the request boundary.
//
// M8 pins the typed errors for each rejection path so the
// response shape is part of the public contract.
import { assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { resolvePublicFile, serveStaticFile } from "./server/static_files.ts";
import { CoreError } from "./server/errors.ts";
import { etagMatches } from "./server/prod_assets.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const TMP_ROOT = join(REPO_ROOT, "tests/.tmp");

async function makeTempDir(
  prefix: string,
): Promise<{ readonly path: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({ prefix, dir: TMP_ROOT });
  return {
    path: dir,
    cleanup: async () => {
      try {
        await Deno.remove(dir, { recursive: true });
      } catch (_cause) {
        // best-effort
      }
    },
  };
}

// ---------------------------------------------------------------------------
// resolvePublicFile
// ---------------------------------------------------------------------------

Deno.test("M8 core: resolvePublicFile returns null for NUL bytes in the URL", async () => {
  const tmp = await makeTempDir("sprout-m8-pub-nul-");
  try {
    const result = await resolvePublicFile(tmp.path, "/foo\0bar");
    assertEquals(result, null);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 core: resolvePublicFile returns null for invalid percent encoding", async () => {
  // `%zz` is not valid UTF-8; `decodeURI` throws.
  const tmp = await makeTempDir("sprout-m8-pub-pct-invalid-");
  try {
    const result = await resolvePublicFile(tmp.path, "/foo%zzbar");
    assertEquals(result, null);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 core: resolvePublicFile returns null for percent-encoded .. in the URL", async () => {
  // `%2e%2e` = `..` after decoding. A naive literal-`..` check would
  // miss this; `resolvePublicFile` decodes before the segment check.
  const tmp = await makeTempDir("sprout-m8-pub-pct-dotdot-");
  try {
    const result = await resolvePublicFile(tmp.path, "/%2e%2e/%2e%2e/secrets.txt");
    assertEquals(result, null);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 core: resolvePublicFile returns null for .. in the URL", async () => {
  const tmp = await makeTempDir("sprout-m8-pub-dotdot-");
  try {
    const result = await resolvePublicFile(tmp.path, "/../etc/passwd");
    assertEquals(result, null);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 core: resolvePublicFile returns null for any /@sprout/ URL", async () => {
  // The framework reserves the /@sprout/ namespace. A public
  // file at that path must NOT shadow the framework asset
  // route; `resolvePublicFile` returns null and the public-file
  // middleware falls through to the framework route handler.
  const tmp = await makeTempDir("sprout-m8-pub-reserved-");
  try {
    const result = await resolvePublicFile(tmp.path, "/@sprout/runtime.js");
    assertEquals(result, null);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 core: resolvePublicFile returns null for a non-existent public file", async () => {
  const tmp = await makeTempDir("sprout-m8-pub-missing-");
  try {
    const result = await resolvePublicFile(tmp.path, "/missing.svg");
    assertEquals(result, null);
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 core: resolvePublicFile returns the absolute path for a present public file", async () => {
  // Positive case: pin the contract so the negative tests have
  // a real positive to compare against.
  const tmp = await makeTempDir("sprout-m8-pub-ok-");
  try {
    await Deno.writeTextFile(join(tmp.path, "favicon.svg"), "<svg/>");
    const result = await resolvePublicFile(tmp.path, "/favicon.svg");
    assertEquals(result, join(tmp.path, "favicon.svg"));
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// serveStaticFile: typed errors
// ---------------------------------------------------------------------------

Deno.test("M8 core: serveStaticFile throws STATIC_FILE_OUTSIDE_ROOT for a sibling path", async () => {
  // The file exists on disk but is outside `publicDir`. The
  // helper refuses to stream it.
  const root = await makeTempDir("sprout-m8-static-root-");
  const sibling = await makeTempDir("sprout-m8-static-sib-");
  try {
    const siblingFile = join(sibling.path, "secret.txt");
    await Deno.writeTextFile(siblingFile, "secret");
    let caught: CoreError | null = null;
    try {
      await serveStaticFile(siblingFile, root.path);
    } catch (e) {
      if (e instanceof CoreError) caught = e;
    }
    if (caught === null) {
      throw new Error("expected CoreError");
    }
    assertEquals(caught.code, "STATIC_FILE_OUTSIDE_ROOT");
    assertStringIncludes(caught.message, "outside");
  } finally {
    await root.cleanup();
    await sibling.cleanup();
  }
});

Deno.test("M8 core: serveStaticFile throws STATIC_FILE_NOT_FOUND for an empty filePath", async () => {
  const tmp = await makeTempDir("sprout-m8-static-empty-");
  try {
    let caught: CoreError | null = null;
    try {
      await serveStaticFile("", tmp.path);
    } catch (e) {
      if (e instanceof CoreError) caught = e;
    }
    if (caught === null) {
      throw new Error("expected CoreError");
    }
    assertEquals(caught.code, "STATIC_FILE_NOT_FOUND");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 core: serveStaticFile throws STATIC_FILE_NOT_FOUND for a missing file", async () => {
  const tmp = await makeTempDir("sprout-m8-static-missing-");
  try {
    let caught: CoreError | null = null;
    try {
      await serveStaticFile(join(tmp.path, "does-not-exist"), tmp.path);
    } catch (e) {
      if (e instanceof CoreError) caught = e;
    }
    if (caught === null) {
      throw new Error("expected CoreError");
    }
    assertEquals(caught.code, "STATIC_FILE_NOT_FOUND");
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// etagMatches
// ---------------------------------------------------------------------------

Deno.test("M8 core: etagMatches handles null and empty headers", () => {
  assertEquals(etagMatches(null, '"abc"'), false);
  assertEquals(etagMatches("", '"abc"'), false);
  assertEquals(etagMatches("   ", '"abc"'), false);
});

Deno.test("M8 core: etagMatches matches *", () => {
  assertEquals(etagMatches("*", '"abc"'), true);
  // The implementation treats "*" as a literal sentinel (per
  // RFC 7232 §3.2). A W/-prefixed "*" is unusual and is not
  // specially recognized: the literal comparison returns
  // false. Pin that behavior here so future refactors do not
  // silently change the contract.
  assertEquals(etagMatches("W/*", '"abc"'), false);
});

Deno.test("M8 core: etagMatches matches an exact quoted value", () => {
  assertEquals(etagMatches('"abc"', '"abc"'), true);
  assertEquals(etagMatches('"abcd"', '"abc"'), false);
});

Deno.test("M8 core: etagMatches matches a weak (W/) variant of a strong ETag", () => {
  // The server emits a strong ETag; a client that quotes it
  // with W/ must still get a 304.
  assertEquals(etagMatches('W/"abc"', '"abc"'), true);
});

Deno.test("M8 core: etagMatches handles comma-separated lists", () => {
  assertEquals(etagMatches('"x", "abc", "y"', '"abc"'), true);
  assertEquals(etagMatches('"x", "y"', '"abc"'), false);
  // Whitespace around entries is ignored.
  assertEquals(etagMatches('  "abc"  ,  "y"  ', '"abc"'), true);
});

// Silence the unused-import warning for `assertRejects` (kept for
// future tests that may use it).
void assertRejects;
