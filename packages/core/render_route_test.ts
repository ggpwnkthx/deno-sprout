// Tests for `renderRoute` HEAD request behavior on page-default routes.
//
// The HEAD fallback to page-default must return an empty body with
// the correct content-type and x-content-type-options headers,
// without reifying the full HTML shell. The outer try/catch for
// ROUTE_RENDER_FAILED must remain functional.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { createApp } from "./mod.ts";
import type { App } from "./mod.ts";

interface TmpProject {
  readonly dir: string;
  readonly cleanup: () => Promise<void>;
}

async function makeProject(
  prefix: string,
  files: Record<string, string>,
): Promise<TmpProject> {
  const dir = await Deno.makeTempDir({ prefix });
  await Deno.writeTextFile(
    `${dir}/sprout.config.ts`,
    `export default { root: ".", styles: { app: false } };\n`,
  );
  await Deno.mkdir(`${dir}/src/routes`, { recursive: true });
  await Deno.mkdir(`${dir}/src/islands`, { recursive: true });
  for (const [relPath, content] of Object.entries(files)) {
    const abs = `${dir}/${relPath}`;
    const parent = abs.substring(0, abs.lastIndexOf("/"));
    if (parent !== dir) {
      await Deno.mkdir(parent, { recursive: true });
    }
    await Deno.writeTextFile(abs, content);
  }
  return {
    dir,
    async cleanup() {
      try {
        await Deno.remove(dir, { recursive: true });
      } catch (_cause) {
        // best-effort
      }
    },
  };
}

// ---------------------------------------------------------------------------
// HEAD: page default returns 200 with null body and correct headers
// ---------------------------------------------------------------------------

Deno.test("renderRoute HEAD: page default returns 200 with null body and correct headers", async () => {
  // Build a route that returns a large JSX tree. The HEAD response must
  // not render the tree — it must return a null body with the deterministic
  // content-type and nosniff header.
  const paragraphs = Array.from({ length: 1000 }, (_, i) => `<p>paragraph ${i}</p>`).join("\n");
  const project = await makeProject("sprout-rr-head-null-", {
    "src/routes/index.tsx":
      `export default function Home() { return (<div>${paragraphs}</div>); }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/", { method: "HEAD" }));
    assertEquals(res.status, 200);
    assertEquals(res.body, null);
    assertEquals(res.headers.get("content-type"), "text/html; charset=utf-8");
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// GET: page default still returns a non-empty body (regression guard)
// ---------------------------------------------------------------------------

Deno.test("renderRoute GET: page default returns non-empty body with expected text", async () => {
  const project = await makeProject("sprout-rr-get-body-", {
    "src/routes/index.tsx": `export default function Home() { return <h1>Hello World</h1>; }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/", { method: "GET" }));
    assertEquals(res.status, 200);
    const body = await res.text();
    assert(body.length > 0, "GET body should be non-empty");
    assert(body.includes("Hello World"), "GET body should contain expected text");
    assert(body.includes("<!doctype html>"), "GET body should be a full HTML shell");
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// HEAD: page default that throws surfaces ROUTE_RENDER_FAILED via outer try/catch
// ---------------------------------------------------------------------------

Deno.test("renderRoute HEAD: page default that throws returns 500 with null body", async () => {
  // The outer try/catch (lines 318-326) must still handle throws from the
  // page default and convert them to a 500 with the correct headers.
  // Per RFC 7231, HEAD responses have the same headers as GET but no body,
  // so we assert body === null.
  const project = await makeProject("sprout-rr-head-throws-", {
    "src/routes/index.tsx": `export default function Home() { throw new Error("oops"); }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/", { method: "HEAD" }));
    assertEquals(res.status, 500);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    // Per RFC 7231, HEAD responses must not include a message body.
    assertEquals(res.body, null);
    // Verify GET on the same route DOES return a body with the error info
    // (proving the fix didn't break GET error handling).
    const getRes = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(getRes.status, 500);
    const getBody = await getRes.text();
    assert(getBody.length > 0, "GET error body must not be empty");
    assertMatch(getBody, /threw|render|handler/i);
  } finally {
    await project.cleanup();
  }
});
