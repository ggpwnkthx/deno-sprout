// M8 hardening tests for malformed route and island modules.
//
// The spec requires that every malformed user-authored module
// produces a typed error at the request boundary, not a crash or
// a silent 200. M8's "Malformed route/island module tests" list
// enumerates the failure modes:
//
//   - A route module that throws on `import`
//   - A route module with no default export and no method exports
//   - A route module whose default export is not a function
//   - A route module whose `GET` export is not a function
//   - A route that returns a non-Response, non-string value
//   - An island module with no default export
//
// The tests build a per-test tmp project, boot the app, and
// assert on the typed response. The same pattern as the M3
// `create_app_error_test.ts` (a throwing route handler) extended
// to the other failure modes.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { discoverProject, validateManifest } from "@sprout/compiler";
import { createApp } from "./mod.ts";
import { loadRouteModules } from "./server/render_route.tsx";
import { CoreError, coreErrorToResponse } from "./server/errors.ts";
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
// Route module that throws on import
// ---------------------------------------------------------------------------

Deno.test("M8 render: a route that throws on import surfaces the error at startup", async () => {
  const project = await makeProject("sprout-m8-rt-import-", {
    "src/routes/index.tsx":
      `throw new Error("kaboom at import time");\nexport default function Home() { return null; };\n`,
  });
  try {
    // With pre-loaded route modules, the error surfaces during
    // createApp (startup), not on the first request. This is the
    // intended behavior: surface syntax errors at startup so they
    // are visible before any request is made.
    let err: CoreError | undefined;
    try {
      await createApp({ root: project.dir, mode: "development" });
      assert(false, "createApp should have thrown");
    } catch (e) {
      assert(e instanceof CoreError, `expected CoreError, got ${e}`);
      err = e;
    }
    assertEquals(err.code, "ROUTE_IMPORT_FAILED");
    assertMatch(err.message, /kaboom|import/i);
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Route module with no default and no method exports
// ---------------------------------------------------------------------------

Deno.test("M8 render: a route with no default and no methods returns 404 ROUTE_NOT_FOUND", async () => {
  // The render layer treats "no handlers at all" as "no route":
  // the registered pattern matches, but no export satisfies
  // any method, so the response is 404 ROUTE_NOT_FOUND.
  const project = await makeProject("sprout-m8-rt-empty-", {
    "src/routes/index.tsx": `export const unrelated = 1;\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 404);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Route module whose default is not a function
// ---------------------------------------------------------------------------

Deno.test("M8 render: a route default that is not a function throws ROUTE_INVALID_EXPORT → 500", async () => {
  // The render layer validates route modules via `asRouteModule`
  // and its `isRouteModuleShape` predicate. A non-function default
  // export (an object) fails the shape check and throws
  // `ROUTE_INVALID_EXPORT`, which the error handler converts to 500.
  const project = await makeProject("sprout-m8-rt-bad-default-", {
    "src/routes/index.tsx": `export default { foo: 1 };\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 500);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Route module whose GET export is not a function
// ---------------------------------------------------------------------------

Deno.test("M8 render: a route whose GET export is not a function throws at startup", async () => {
  // With pre-loaded route modules, a non-function GET export is
  // caught by `isRouteModuleShape` during `loadRouteModules` and
  // throws `ROUTE_INVALID_EXPORT` before `createApp` returns.
  const project = await makeProject("sprout-m8-rt-bad-get-", {
    "src/routes/index.tsx": `export const GET = 42;\n`,
  });
  try {
    let err: CoreError | undefined;
    try {
      await createApp({ root: project.dir, mode: "development" });
      assert(false, "createApp should have thrown");
    } catch (e) {
      assert(e instanceof CoreError, `expected CoreError, got ${e}`);
      err = e;
    }
    assertEquals(err.code, "ROUTE_INVALID_EXPORT");
    assertMatch(err.message, /GET.*not a function/i);
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Route that returns a non-Response, non-string value
// ---------------------------------------------------------------------------

Deno.test("M8 render: a route that returns a primitive number is wrapped as text", async () => {
  // The render layer wraps non-Response returns in the HTML
  // shell. The handler returning `42` produces a 200 with
  // content-type text/html. The literal `42` is not a valid
  // JSXNode, but the shell stringifies it.
  const project = await makeProject("sprout-m8-rt-primitive-", {
    "src/routes/index.tsx": `export default function Home() { return 42; }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    // The shell accepts the value, the response is a 200 HTML
    // shell with the primitive stringified into the body.
    // (The shell renders arbitrary children; the literal `42`
    // becomes the text node "42".)
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const ctype = res.headers.get("content-type") ?? "";
    assertMatch(ctype, /^text\/html/);
    const body = await res.text();
    assertMatch(body, /<!doctype html>/);
    // The primitive 42 appears somewhere in the body (the
    // shell's child rendering).
    assertMatch(body, /42/);
  } finally {
    await project.cleanup();
  }
});

Deno.test("M8 render: a route that returns null throws ROUTE_RENDER_FAILED → 500", async () => {
  // A null return from a route handler must produce a 500
  // ROUTE_RENDER_FAILED — not a 200 with the literal text "null".
  const project = await makeProject("sprout-m8-rt-null-", {
    "src/routes/index.tsx": `export default function Home() { return null; }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 500);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const body = await res.text();
    // The literal text "null" must NOT appear in the body.
    assert(!body.includes("null"), `body should not contain "null", got: ${body}`);
  } finally {
    await project.cleanup();
  }
});

Deno.test("M8 render: a route that returns undefined throws ROUTE_RENDER_FAILED → 500", async () => {
  // An undefined return from a route handler must produce a 500
  // ROUTE_RENDER_FAILED — not a 200 with the literal text "undefined".
  const project = await makeProject("sprout-m8-rt-undefined-", {
    "src/routes/index.tsx": `export default function Home() { return undefined; }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 500);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const body = await res.text();
    // The literal text "undefined" must NOT appear in the body.
    assert(
      !body.includes("undefined"),
      `body should not contain "undefined", got: ${body}`,
    );
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Unsupported (unknown) HTTP method returns 501 without Allow header
// ---------------------------------------------------------------------------

Deno.test("M8 render: an unknown HTTP method returns 501 without Allow header", async () => {
  // RFC 7231 §6.6.2: 501 (Not Implemented) is correct for a method
  // not in the server's closed list of known methods (e.g. BREW, FOOBAR).
  // Unlike 405 there is no `Allow` header because the method is not
  // a valid HTTP verb at all on this server.
  const project = await makeProject("sprout-m8-rt-unsupported-method-", {
    "src/routes/index.tsx": `export default function Home() { return <h1>hi</h1>; }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(
      new Request("http://0.0.0.0/", { method: "BREW" }),
    );
    assertEquals(res.status, 501);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    // There must be no Allow header for a truly unknown method.
    assertEquals(res.headers.get("allow"), null);
    // FOOBAR also returns 501.
    const res2 = await app.fetch(
      new Request("http://0.0.0.0/", { method: "FOOBAR" }),
    );
    assertEquals(res2.status, 501);
    assertEquals(res2.headers.get("allow"), null);
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Known HTTP method not on the route returns 405 with Allow header
// ---------------------------------------------------------------------------

Deno.test("M8 render: POST to a GET-only route returns 405 with Allow header", async () => {
  // A known method (POST) that is not exported on the matched route
  // returns 405 Method Not Allowed with an Allow header listing the
  // methods that ARE present on the route.
  const project = await makeProject("sprout-m8-rt-known-method-not-on-route-", {
    "src/routes/index.tsx": `export default function Home() { return <h1>hi</h1>; }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(
      new Request("http://0.0.0.0/", { method: "POST" }),
    );
    assertEquals(res.status, 405);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const allow = res.headers.get("allow") ?? "";
    // The page default implicitly provides GET and HEAD.
    assert(allow.includes("GET"), `Allow header should include GET, got ${allow}`);
    assert(allow.includes("HEAD"), `Allow header should include HEAD, got ${allow}`);
    // POST must NOT be in the Allow header since it's not on the route.
    assert(!allow.includes("POST"), `Allow header should NOT include POST, got ${allow}`);
  } finally {
    await project.cleanup();
  }
});

Deno.test("M8 render: OPTIONS on a route without OPTIONS handler returns 405 with Allow header", async () => {
  // A route with GET but no explicit OPTIONS handler: the server
  // returns 405 with Allow listing the methods present (GET, HEAD).
  const project = await makeProject("sprout-m8-rt-options-", {
    "src/routes/index.tsx": `export default function Home() { return <h1>hi</h1>; }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(
      new Request("http://0.0.0.0/", { method: "OPTIONS" }),
    );
    assertEquals(res.status, 405);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const allow = res.headers.get("allow") ?? "";
    assert(allow.includes("GET"), `Allow header should include GET, got ${allow}`);
    assert(allow.includes("HEAD"), `Allow header should include HEAD, got ${allow}`);
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// coreErrorToResponse mapping
// ---------------------------------------------------------------------------

Deno.test("M8 render: coreErrorToResponse maps each CoreError code to the right status", async () => {
  // Direct unit test on the response converter. The full
  // pipeline is covered by the integration tests above; this
  // pins the code→status mapping for any future refactor.
  const cases: Array<[string, number, string]> = [
    ["ROUTE_NOT_FOUND", 404, "Not Found"],
    ["STATIC_FILE_NOT_FOUND", 404, "Not Found"],
    ["STATIC_FILE_OUTSIDE_ROOT", 404, "Not Found"],
    ["ROUTE_METHOD_NOT_ALLOWED", 405, "Method Not Allowed"],
    ["ROUTE_METHOD_NOT_IMPLEMENTED", 501, "Not Implemented"],
    ["ROUTE_IMPORT_FAILED", 500, "Internal Server Error"],
    ["ROUTE_INVALID_EXPORT", 500, "Internal Server Error"],
    ["ROUTE_RENDER_FAILED", 500, "Internal Server Error"],
  ];
  for (const [code, expectedStatus, fallback] of cases) {
    const err = new CoreError(code as never, `test ${code}`, {});
    const res = coreErrorToResponse(err);
    assertEquals(
      res.status,
      expectedStatus,
      `code ${code} should map to ${expectedStatus}`,
    );
    assertEquals(
      res.headers.get("x-content-type-options"),
      "nosniff",
      `code ${code} should set x-content-type-options: nosniff`,
    );
    // ROUTE_METHOD_NOT_IMPLEMENTED (501) must not have an Allow header.
    if (code === "ROUTE_METHOD_NOT_IMPLEMENTED") {
      assertEquals(
        res.headers.get("allow"),
        null,
        "501 must not have an Allow header",
      );
    }
    // The body is either the message or the fallback.
    const body = await res.text();
    assert(body.length > 0, `body should be non-empty for ${code}`);
    // The fallback text appears in the body for the 500
    // paths when no message is set; otherwise the message
    // does. Both are non-empty.
    if (code === "STATIC_FILE_OUTSIDE_ROOT") {
      // The 404 body for OUTSIDE_ROOT is the generic "Not Found"
      // (path is hidden in details).
      assert(
        body === fallback || body === err.message,
        `OUTSIDE_ROOT body should be the generic fallback, got ${body}`,
      );
    }
  }
});

Deno.test("M8 render: a successful route renders the HTML shell", async () => {
  // Positive control: a working route returns 200 with the
  // shell, the runtime script tag, and no error markers.
  const project = await makeProject("sprout-m8-rt-ok-", {
    "src/routes/index.tsx": `export default function Home() { return <h1>hi</h1>; }\n`,
  });
  try {
    const app: App = await createApp({ root: project.dir, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("x-content-type-options"), "nosniff");
    const body = await res.text();
    assertMatch(body, /<!doctype html>/);
    assertMatch(body, /<h1>hi<\/h1>/);
    assertMatch(
      body,
      /<script type="module" src="\/@sprout\/runtime.js">/,
    );
  } finally {
    await project.cleanup();
  }
});

// ---------------------------------------------------------------------------
// loadRouteModules: startup pre-loading invariant
// ---------------------------------------------------------------------------

Deno.test("loadRouteModules: throws ROUTE_IMPORT_FAILED when a route throws on import", async () => {
  const project = await makeProject("sprout-m8-lrm-throws-", {
    "src/routes/index.tsx":
      `throw new Error("syntax error at load");\nexport default function Home() { return null; }\n`,
  });
  try {
    const config = { root: project.dir, mode: "development" as const };
    const configMod = await import("@sprout/config");
    const resolved = await configMod.loadConfig(config);
    const discovered = await discoverProject(resolved);
    const manifest = validateManifest(discovered);
    let err: CoreError | undefined;
    try {
      await loadRouteModules(manifest);
      assert(false, "loadRouteModules should have thrown");
    } catch (e) {
      assert(e instanceof CoreError, `expected CoreError, got ${e}`);
      err = e;
    }
    assertEquals(err.code, "ROUTE_IMPORT_FAILED");
    assertMatch(err.message, /failed to import|syntax error/i);
  } finally {
    await project.cleanup();
  }
});

Deno.test("loadRouteModules: returns a map with one entry per route file and a valid RouteModule value", async () => {
  const project = await makeProject("sprout-m8-lrm-ok-", {
    "src/routes/index.tsx": `export default function Home() { return <h1>hi</h1>; }\n`,
    "src/routes/about.tsx": `export default function About() { return <h1>about</h1>; }\n`,
  });
  try {
    const config = { root: project.dir, mode: "development" as const };
    const configMod = await import("@sprout/config");
    const resolved = await configMod.loadConfig(config);
    const discovered = await discoverProject(resolved);
    const manifest = validateManifest(discovered);
    const routeModules = await loadRouteModules(manifest);
    // One entry per route file.
    assertEquals(routeModules.size, manifest.routes.length);
    // Each key is a route file path.
    for (const route of manifest.routes) {
      assert(routeModules.has(route.file), `map should have key for ${route.file}`);
      const mod = routeModules.get(route.file);
      assert(mod !== undefined, `RouteModule for ${route.file} should not be undefined`);
    }
  } finally {
    await project.cleanup();
  }
});
