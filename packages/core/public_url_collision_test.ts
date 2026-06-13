// M8 hardening tests for the public-URL / framework-namespace
// collision contract.
//
// The spec pins the rule: "Public directory files must not shadow
// framework URLs" (security-and-validation.md §13). The M3 server
// wires this as an order-of-handlers decision: the public-file
// middleware runs first and returns null for any URL under
// `/@sprout/`, so the framework asset route handler runs next and
// serves the framework asset. A public file at the same path
// must NEVER be served in place of the framework asset.
//
// These tests build per-test tmp projects that include a public
// file at a framework URL and assert the framework asset wins in
// both development and production modes.
import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { buildProduction } from "@sprout/compiler";
import type { ResolvedConfig } from "@sprout/config";
import { _resetDevCacheForTests } from "@sprout/compiler";
import { createApp } from "./mod.ts";
import type { App } from "./mod.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const FIXTURE = join(REPO_ROOT, "tests/fixtures/basic-app");
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

async function copyFixtureTo(target: string): Promise<void> {
  // Copy the basic-app fixture wholesale (so the routes / islands
  // / stylesheet match the canonical discovery baseline) and then
  // override the publicDir to point at a directory we control
  // for the public-URL test.
  const { copy } = await import("jsr:@std/fs@1/copy");
  await copy(FIXTURE, target, { overwrite: true });
  const configPath = join(target, "sprout.config.ts");
  await Deno.writeTextFile(
    configPath,
    `export default { root: ".", outDir: ".sprout/dist", publicDir: "public" };\n`,
  );
}

async function buildProjectAt(root: string): Promise<void> {
  _resetDevCacheForTests();
  const configMod = await import("@sprout/config");
  const cfg: ResolvedConfig = await configMod.loadConfig({
    root,
    mode: "production",
  });
  await buildProduction({ config: cfg });
}

// ---------------------------------------------------------------------------
// Dev mode
// ---------------------------------------------------------------------------

Deno.test("M8 collision: dev /@sprout/runtime.js returns the framework asset, not a public file", async () => {
  const tmp = await makeTempDir("sprout-m8-collide-dev-rt-");
  try {
    await copyFixtureTo(tmp.path);
    // Drop a public file at the framework's runtime URL. The
    // file content is distinctive (the magic string "PUBLIC FILE
    // WINS") so we can prove which one was served.
    const evilFile = join(tmp.path, "public/@sprout/runtime.js");
    await Deno.mkdir(join(tmp.path, "public/@sprout"), { recursive: true });
    await Deno.writeTextFile(evilFile, "/* PUBLIC FILE WINS */");
    const app: App = await createApp({ root: tmp.path, mode: "development" });
    const res = await app.fetch(new Request("http://localhost/@sprout/runtime.js"));
    assertEquals(res.status, 200);
    // The framework asset uses `cache-control: no-store` in dev;
    // a static-file response uses `cache-control: public,
    // max-age=3600`. The dev asset header proves which handler
    // ran.
    assertEquals(res.headers.get("cache-control"), "no-store");
    const body = await res.text();
    assertStringIncludes(body, "start");
    // The public file's magic string must NOT appear in the
    // body; the framework asset is the actual esbuild output.
    assert(
      !body.includes("PUBLIC FILE WINS"),
      `framework route was shadowed; got: ${body.slice(0, 64)}`,
    );
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 collision: dev /@sprout/app.css returns the framework stylesheet, not a public file", async () => {
  const tmp = await makeTempDir("sprout-m8-collide-dev-css-");
  try {
    await copyFixtureTo(tmp.path);
    const evilFile = join(tmp.path, "public/@sprout/app.css");
    await Deno.mkdir(join(tmp.path, "public/@sprout"), { recursive: true });
    await Deno.writeTextFile(evilFile, "/* PUBLIC CSS WINS */");
    const app: App = await createApp({ root: tmp.path, mode: "development" });
    const res = await app.fetch(new Request("http://localhost/@sprout/app.css"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("cache-control"), "no-store");
    const body = await res.text();
    assertStringIncludes(body, "body");
    assert(
      !body.includes("PUBLIC CSS WINS"),
      `framework stylesheet was shadowed; got: ${body.slice(0, 64)}`,
    );
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 collision: dev /@sprout/island/Counter.js returns the framework island, not a public file", async () => {
  const tmp = await makeTempDir("sprout-m8-collide-dev-isl-");
  try {
    await copyFixtureTo(tmp.path);
    const evilFile = join(tmp.path, "public/@sprout/island/Counter.js");
    await Deno.mkdir(join(tmp.path, "public/@sprout/island"), { recursive: true });
    await Deno.writeTextFile(evilFile, "/* PUBLIC ISLAND WINS */");
    const app: App = await createApp({ root: tmp.path, mode: "development" });
    const res = await app.fetch(new Request("http://localhost/@sprout/island/Counter.js"));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("cache-control"), "no-store");
    const body = await res.text();
    // The framework island bundle includes `mountComponent`.
    assertStringIncludes(body, "mountComponent");
    assert(
      !body.includes("PUBLIC ISLAND WINS"),
      `framework island was shadowed; got: ${body.slice(0, 64)}`,
    );
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Production mode
// ---------------------------------------------------------------------------

Deno.test("M8 collision: prod /@sprout/runtime.js returns the frozen asset, not a public file", async () => {
  const tmp = await makeTempDir("sprout-m8-collide-prod-rt-");
  try {
    await copyFixtureTo(tmp.path);
    const evilFile = join(tmp.path, "public/@sprout/runtime.js");
    await Deno.mkdir(join(tmp.path, "public/@sprout"), { recursive: true });
    await Deno.writeTextFile(evilFile, "/* PUBLIC FILE WINS */");
    await buildProjectAt(tmp.path);
    const app: App = await createApp({ root: tmp.path, mode: "production" });
    const res = await app.fetch(new Request("http://localhost/@sprout/runtime.js"));
    assertEquals(res.status, 200);
    // The frozen asset uses `cache-control: ...immutable`; a
    // static-file response uses `public, max-age=3600`. The
    // immutable header proves which handler ran.
    assertEquals(
      res.headers.get("cache-control"),
      "public, max-age=31536000, immutable",
    );
    const body = await res.text();
    assertStringIncludes(body, "start");
    assert(
      !body.includes("PUBLIC FILE WINS"),
      `frozen asset was shadowed; got: ${body.slice(0, 64)}`,
    );
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Positive controls: the public-file middleware is still active
// for non-framework URLs even when a public file shadows a route.
// ---------------------------------------------------------------------------

Deno.test("M8 collision: public /favicon.svg is served normally in dev", async () => {
  const tmp = await makeTempDir("sprout-m8-collide-fav-");
  try {
    await copyFixtureTo(tmp.path);
    // The fixture already has public/favicon.svg; we just
    // re-write it with a distinctive body.
    const favicon = join(tmp.path, "public/favicon.svg");
    await Deno.writeTextFile(favicon, "<svg>FRAMEWORK_FAVICON</svg>");
    const app: App = await createApp({ root: tmp.path, mode: "development" });
    const res = await app.fetch(new Request("http://localhost/favicon.svg"));
    assertEquals(res.status, 200);
    // The public-file middleware uses
    // `cache-control: public, max-age=3600`.
    assertEquals(res.headers.get("cache-control"), "public, max-age=3600");
    const body = await res.text();
    assertStringIncludes(body, "FRAMEWORK_FAVICON");
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("M8 collision: a user route at / wins over public/index.html", async () => {
  // The M3 router orders handlers so a registered route wins
  // over a public file at the same URL. The spec's wording
  // ("Public files must not shadow framework URLs") is about
  // the /@sprout/ namespace, not all routes; this test pins
  // the per-route behavior so future refactors of the router
  // order are caught.
  const tmp = await makeTempDir("sprout-m8-collide-route-");
  try {
    await copyFixtureTo(tmp.path);
    // Drop a public file at /index.html that would otherwise
    // resolve to "/". The route at / must still win.
    const indexFile = join(tmp.path, "public/index.html");
    await Deno.writeTextFile(indexFile, "<html>PUBLIC_INDEX</html>");
    const app: App = await createApp({ root: tmp.path, mode: "development" });
    const res = await app.fetch(new Request("http://localhost/"));
    assertEquals(res.status, 200);
    const body = await res.text();
    // The route renders the shell + the counter placeholder.
    assertStringIncludes(body, 'data-sprout-island="Counter"');
    assert(
      !body.includes("PUBLIC_INDEX"),
      `route was shadowed by public file; got: ${body.slice(0, 64)}`,
    );
  } finally {
    await tmp.cleanup();
  }
});
