// M3 error-path tests for `@sprout/core`.
//
// These tests build a tiny throwaway project in a tmp directory,
// register a route whose default export throws, and assert that the
// response is a 500 with a short, plain-text body. The tmp project
// is removed at the end of the test.
//
// The test is its own file so the tmpdir setup does not need to be
// reused by the other (fixture-based) `create_app_test.ts` tests.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { createApp } from "./mod.ts";
import type { App } from "./mod.ts";

async function makeThrowingProject(): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({ prefix: "sprout-m3-throw-" });
  // Minimal config (the loader accepts no config file at all, but
  // we write a config so the project's `src/` is relative to the
  // project root).
  await Deno.writeTextFile(
    `${dir}/sprout.config.ts`,
    `export default { root: "." };\n`,
  );
  // Single route whose default export throws.
  await Deno.mkdir(`${dir}/src/routes`, { recursive: true });
  await Deno.writeTextFile(
    `${dir}/src/routes/index.tsx`,
    `export default function Home(): unknown { throw new Error("boom"); }\n`,
  );
  return {
    dir,
    async cleanup() {
      try {
        await Deno.remove(dir, { recursive: true });
      } catch (_cause) {
        // Best-effort cleanup.
      }
    },
  };
}

Deno.test("createApp: a throwing route handler returns 500 with a short body", async () => {
  const { dir, cleanup } = await makeThrowingProject();
  try {
    const app: App = await createApp({ root: dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 500);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const ctype = res.headers.get("content-type") ?? "";
    assertMatch(ctype, /^text\/plain/);
    const body = await res.text();
    // The 500 body should mention the failure somehow. M3 keeps
    // the message short and free of stack traces.
    assert(body.length > 0, "500 body must not be empty");
    assert(body.length < 1024, "500 body should be short");
    assertMatch(body, /boom|threw|render|handler/i);
  } finally {
    await cleanup();
  }
});
