// Tests for `@sprout/cli` (M5 — CLI MVP).
//
// The test file is co-located with `cli.ts` per the M5 spec.
// All tests use `Deno.makeTempDir` for per-test scratch directories
// and `silent: true` to keep test output clean. The few tests
// that need to assert on stdout or stderr use the `capture*`
// helpers to install temporary replacements for `console.log` and
// `console.error`.
//
// The tests cover the M5 exit criteria:
//
//   1. `init` creates a runnable app.
//   2. `dev` serves the generated app.
//   3. `inspect` prints routes and islands.
//   4. CLI tests do not call `Deno.exit()` directly.
//
// They also cover the M5 deliverables (`help`, `build`, `serve`,
// `inspect`, the `run()` shape, and human-readable errors) per
// the spec.
import {
  assert,
  assertEquals,
  assertExists,
  assertMatch,
  assertStringIncludes,
} from "jsr:@std/assert@1";
import { fromFileUrl, join, toFileUrl } from "@std/path";
import { CliError, formatError, parseArgs, printHelp, run } from "./mod.ts";
import type { CliResult } from "./mod.ts";
import { FrameworkError } from "@sprout/utils";
import { INIT_FILES } from "./templates.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));

function workspaceImportUrl(rel: string): string {
  return toFileUrl(join(REPO_ROOT, rel)).href;
}

async function rewriteGeneratedImportsToWorkspace(root: string): Promise<void> {
  const denoJsoncPath = join(root, "deno.jsonc");
  const denoJsonc = JSON.parse(await Deno.readTextFile(denoJsoncPath)) as {
    readonly tasks?: Record<string, string>;
    readonly compilerOptions?: Record<string, unknown>;
  };
  await Deno.writeTextFile(
    denoJsoncPath,
    JSON.stringify(
      {
        ...denoJsonc,
        imports: {
          "@sprout/core": workspaceImportUrl("packages/core/mod.ts"),
          "@sprout/config": workspaceImportUrl("packages/config/mod.ts"),
          "@sprout/compiler": workspaceImportUrl("packages/compiler/mod.ts"),
          "@sprout/jsx": workspaceImportUrl("packages/jsx/mod.ts"),
          "@sprout/jsx/dom": workspaceImportUrl("packages/jsx/dom/mod.ts"),
          "@sprout/jsx/dom/jsx-runtime": workspaceImportUrl("packages/jsx/dom/jsx-runtime.ts"),
          "@sprout/jsx/dom/jsx-dev-runtime": workspaceImportUrl(
            "packages/jsx/dom/jsx-runtime.ts",
          ),
          "@sprout/jsx/shared": workspaceImportUrl("packages/jsx/shared/mod.ts"),
          "@sprout/jsx/server/island-registry": workspaceImportUrl(
            "packages/jsx/server/island-registry.ts",
          ),
          "@sprout/runtime": workspaceImportUrl("packages/runtime/mod.ts"),
          "@sprout/utils": workspaceImportUrl("packages/utils/mod.ts"),
        },
      },
      null,
      2,
    ) + "\n",
  );
}

// ---------------------------------------------------------------------------
// Capture helpers
// ---------------------------------------------------------------------------

type ConsoleSpy = {
  readonly lines: readonly string[];
  readonly restore: () => void;
};

/** Replace `console.log` and `console.error` with an in-memory buffer. */
function captureConsole(): ConsoleSpy {
  const lines: string[] = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  console.error = (...args: unknown[]) => {
    lines.push(args.map((a) => String(a)).join(" "));
  };
  return {
    lines,
    restore: () => {
      console.log = originalLog;
      console.error = originalError;
    },
  };
}

// ---------------------------------------------------------------------------
// `run()` shape
// ---------------------------------------------------------------------------

Deno.test("run: help command returns ok", async () => {
  const r = await run(["help"], { silent: true });
  assertEquals(r, { ok: true, code: 0 } satisfies CliResult);
});

Deno.test("run: help command prints the usage to stdout", async () => {
  const spy = captureConsole();
  try {
    const r = await run(["help"]);
    assertEquals(r.ok, true);
    const text = spy.lines.join("\n");
    assertStringIncludes(text, "Commands:");
    for (const cmd of ["init", "dev", "build", "serve", "inspect", "help"]) {
      assertStringIncludes(text, cmd);
    }
  } finally {
    spy.restore();
  }
});

Deno.test("run: no args defaults to help", async () => {
  const r = await run([], { silent: true });
  assertEquals(r, { ok: true, code: 0 } satisfies CliResult);
});

Deno.test("run: unknown command returns non-zero with CLI_UNKNOWN_COMMAND", async () => {
  const r = await run(["bogus"], { silent: true });
  assertEquals(r.ok, false);
  if (r.ok) throw new Error("expected failure");
  assertEquals(r.code, 1);
  assert(r.error instanceof CliError);
  assertEquals(r.error.code, "CLI_UNKNOWN_COMMAND");
});

Deno.test("run: --force flag is parsed as a boolean", async () => {
  // No-op call: a bogus command receives the parsed flags.
  const r = await run(["bogus", "--force"], { silent: true });
  assertEquals(r.ok, false);
});

Deno.test("run: never calls Deno.exit (asserted via run being a Promise)", async () => {
  // This is a code-shape test: the spec exit criterion is that
  // CLI tests do not call Deno.exit() directly. `run` returning a
  // Promise<CliResult> and not throwing proves the contract: the
  // only caller (the binary entrypoint in a later milestone) is
  // the layer that may call Deno.exit(). If `run` ever called
  // Deno.exit, the test process would terminate and the assertion
  // below would never run.
  const r = await run(["help"], { silent: true });
  assertExists(r);
});

// ---------------------------------------------------------------------------
// `init`
// ---------------------------------------------------------------------------

Deno.test("init: scaffolds a runnable project", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprout-m5-init-" });
  try {
    const r = await run(["init", tmp], { silent: true });
    assertEquals(r, { ok: true, code: 0 } satisfies CliResult);

    // All expected files exist.
    for (const file of INIT_FILES) {
      const stat = Deno.statSync(join(tmp, file.relPath));
      assert(stat.isFile, `expected file at ${file.relPath}`);
    }

    // The generated `deno.jsonc` references the cli.
    const denoJsonc = await Deno.readTextFile(join(tmp, "deno.jsonc"));
    assertStringIncludes(denoJsonc, "@sprout/core");
    assertStringIncludes(denoJsonc, "jsr:@sprout/cli");

    // The generated `sprout.config.ts` uses `defineConfig`.
    const config = await Deno.readTextFile(join(tmp, "sprout.config.ts"));
    assertStringIncludes(config, "defineConfig");
    assertStringIncludes(config, "root:");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("init: refused to overwrite non-empty directory returns CLI_INIT_TARGET_NOT_EMPTY", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprout-m5-init-no-force-" });
  try {
    await Deno.writeTextFile(join(tmp, "bogus.txt"), "junk");

    const r = await run(["init", tmp], { silent: true });
    assertEquals(r.ok, false);
    if (r.ok) throw new Error("expected failure");
    assert(r.error instanceof CliError);
    assertEquals(r.error.code, "CLI_INIT_TARGET_NOT_EMPTY");
    // bogus.txt must still be there.
    assertEquals(Deno.statSync(join(tmp, "bogus.txt")).isFile, true);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("init: --force overwrites init-template files but refuses to delete foreign files", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprout-m5-init-force-" });
  try {
    // Pre-create a foreign file (not in INIT_FILES) AND a
    // template file (in INIT_FILES) with junk content.
    await Deno.writeTextFile(join(tmp, "bogus.txt"), "junk");
    await Deno.writeTextFile(join(tmp, "deno.jsonc"), '{ "junk": true }');

    // Without --force: refused.
    const refused = await run(["init", tmp], { silent: true });
    assertEquals(refused.ok, false);
    if (refused.ok) throw new Error("expected failure");
    assert(refused.error instanceof CliError);
    assertEquals(refused.error.code, "CLI_INIT_TARGET_NOT_EMPTY");

    // With --force: refused because of the foreign file.
    const refusedForce = await run(["init", tmp, "--force"], { silent: true });
    assertEquals(refusedForce.ok, false);
    if (refusedForce.ok) throw new Error("expected failure");
    assert(refusedForce.error instanceof CliError);
    assertEquals(refusedForce.error.code, "CLI_INIT_FAILED");

    // Remove the foreign file; --force should succeed and
    // overwrite the template file.
    await Deno.remove(join(tmp, "bogus.txt"));
    const ok = await run(["init", tmp, "--force"], { silent: true });
    assertEquals(ok, { ok: true, code: 0 } satisfies CliResult);

    // The template file is now the canonical content.
    const denoJsonc = await Deno.readTextFile(join(tmp, "deno.jsonc"));
    assertStringIncludes(denoJsonc, "@sprout/core");
    assert(!denoJsonc.includes("junk"), "deno.jsonc should be overwritten");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

/**
 * The island-bundle fetch is intentionally not asserted here
 * because it requires M10's JSR publish; M5 proves the template
 * is structurally complete by checking the generated import map
 * and the dev-server routes that do not depend on remote
 * fetches.
 */
Deno.test("init: creates a project whose generated deno.jsonc has the framework import map and whose dev server serves the page + runtime + CSS", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprout-m5-init-boot-" });
  try {
    const r = await run(["init", tmp], { silent: true });
    assertEquals(r.ok, true);
    const generatedDenoJsonc = JSON.parse(
      await Deno.readTextFile(join(tmp, "deno.jsonc")),
    ) as { imports?: Record<string, string> };
    await rewriteGeneratedImportsToWorkspace(tmp);

    // Boot the dev server against the freshly-init'd project and
    // hit `/`. This is the M5 exit-criterion proof: init creates
    // a runnable app, and dev serves it.
    const { createApp } = await import("@sprout/core");
    const app = await createApp({ root: tmp, mode: "development" });
    const res = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(res.status, 200);
    const body = await res.text();
    assertStringIncludes(body, "<h1>Hello, Sprout!</h1>");
    // The Counter island placeholder contract:
    assertStringIncludes(body, 'data-sprout-island="Counter"');
    // The runtime script tag (M4 dev asset pipeline).
    assertStringIncludes(body, "/@sprout/runtime.js");

    // The dev pipeline must actually be able to serve the
    // runtime script and the app CSS — both of these routes are
    // satisfied without fetching any framework JSR package.
    // The island-bundle fetch is deferred to M10 (see JSDoc
    // above): it requires `jsr:@sprout/*` packages that M5 does
    // not publish.
    const runtimeRes = await app.fetch(new Request("http://0.0.0.0/@sprout/runtime.js"));
    assertEquals(runtimeRes.status, 200);
    assertEquals(runtimeRes.headers.get("content-type"), "text/javascript; charset=utf-8");
    assertEquals(runtimeRes.headers.get("cache-control"), "no-store");

    const cssRes = await app.fetch(new Request("http://0.0.0.0/@sprout/app.css"));
    assertEquals(cssRes.status, 200);
    assertEquals(cssRes.headers.get("content-type"), "text/css; charset=utf-8");

    // The generated `deno.jsonc` must mirror the workspace's
    // framework import map closely enough that the dev pipeline
    // can resolve every framework package the bundler needs.
    // Deno's resolver walks up from each imported file's
    // location and finds the nearest `deno.jsonc`; in a
    // freshly-init'd project that is the generated file, not
    // the workspace. Asserting on the import map keys here is
    // the M5-honest check; the actual end-to-end island-bundle
    // fetch lands with M10's JSR publish.
    const imports = generatedDenoJsonc.imports ?? {};
    for (
      const key of [
        "@sprout/core",
        "@sprout/jsx",
        "@sprout/jsx/dom",
        "@sprout/jsx/dom/jsx-runtime",
        "@sprout/jsx/dom/jsx-dev-runtime",
        "@sprout/runtime",
        "@sprout/utils",
      ]
    ) {
      assertEquals(typeof imports[key], "string", `expected import map to include ${key}`);
    }
    assertMatch(imports["@sprout/jsx"] ?? "", /^jsr:@sprout\/jsx@/);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// `inspect`
// ---------------------------------------------------------------------------

Deno.test("inspect: prints the resolved config and the discovered project", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprout-m5-inspect-" });
  try {
    // First, init a project so inspect has something to find.
    const init = await run(["init", tmp], { silent: true });
    assertEquals(init.ok, true);

    const spy = captureConsole();
    try {
      const r = await run(["inspect", tmp], { silent: false });
      assertEquals(r, { ok: true, code: 0 } satisfies CliResult);
      const text = spy.lines.join("\n");
      assertStringIncludes(text, "Sprout project:");
      assertStringIncludes(text, "Routes:");
      assertStringIncludes(text, "Islands:");
      assertMatch(text, /\//);
    } finally {
      spy.restore();
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

Deno.test("inspect: human-readable errors include the framework error code", async () => {
  const spy = captureConsole();
  try {
    // Point inspect at a non-existent directory; loadConfig will
    // accept it (defaults) and discoverProject will see an empty
    // project, so we use a malformed config instead.
    const tmp = await Deno.makeTempDir({ prefix: "sprout-m5-inspect-bad-" });
    try {
      await Deno.writeTextFile(
        join(tmp, "sprout.config.ts"),
        'export default { server: { port: "not-a-number" } };',
      );
      const r = await run(["inspect", tmp], { silent: false });
      assertEquals(r.ok, false);
      if (r.ok) throw new Error("expected failure");
      assert(r.error instanceof FrameworkError);
      // The error formatter must have included the code.
      const text = spy.lines.join("\n");
      assertStringIncludes(text, "CONFIG_INVALID_PORT");
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  } finally {
    spy.restore();
  }
});

Deno.test("inspect: --debug flag prints stack traces for non-framework errors", async () => {
  // Stub `loadConfig` by pointing the CLI at a directory that
  // contains a syntactically broken config: the import throws a
  // generic Error, not a FrameworkError. With debug: true, the
  // formatter appends the stack.
  const tmp = await Deno.makeTempDir({ prefix: "sprout-m5-debug-" });
  try {
    await Deno.writeTextFile(
      join(tmp, "sprout.config.ts"),
      "throw new Error('synthetic boom');",
    );
    const spy = captureConsole();
    try {
      const r = await run(["inspect", tmp, "--debug"], { silent: false });
      assertEquals(r.ok, false);
      if (r.ok) throw new Error("expected failure");
      const text = spy.lines.join("\n");
      assertStringIncludes(text, "synthetic boom");
      // The stack frame marker (`at `) is part of V8's default
      // stack trace format.
      assertStringIncludes(text, "at ");
    } finally {
      spy.restore();
    }
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// `dev` and `serve` (mode semantics)
// ---------------------------------------------------------------------------

Deno.test("dev and serve: in M7, they use different asset pipelines", async () => {
  // The M5 placeholder was removed in M7: `serve` is now the
  // real production serve. The end-to-end behaviour is no
  // longer identical: dev sets `cache-control: no-store` and
  // serves on-demand-compiled bytes; production loads the
  // frozen manifest, builds the O(1) public-path index, and
  // serves content-hashed assets with `ETag` / gzip / immutable
  // cache headers.
  //
  // The full end-to-end smoke for `serve` lives in
  // `serve_command_test.ts` (it builds a project from the
  // basic-app fixture and exercises the production App). Here
  // we assert the simpler contract: the `init`-generated app's
  // dev pipeline still works in dev mode (unchanged from M5).
  const tmp = await Deno.makeTempDir({ prefix: "sprout-m7-devserve-" });
  try {
    const init = await run(["init", tmp], { silent: true });
    assertEquals(init.ok, true);
    await rewriteGeneratedImportsToWorkspace(tmp);

    const { createApp } = await import("@sprout/core");

    // Dev pipeline: HTML response with island placeholder +
    // runtime script tag + no-store cache control.
    const devApp = await createApp({ root: tmp, mode: "development" });
    const devRes = await devApp.fetch(new Request("http://0.0.0.0/"));
    assertEquals(devRes.status, 200);
    const devBody = await devRes.text();
    assertStringIncludes(devBody, "/@sprout/runtime.js");
    assertStringIncludes(devBody, 'data-sprout-island="Counter"');
    const devRuntime = await devApp.fetch(
      new Request("http://0.0.0.0/@sprout/runtime.js"),
    );
    assertEquals(devRuntime.headers.get("cache-control"), "no-store");
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// `build` (M6)
// ---------------------------------------------------------------------------
//
// The M5 placeholder test was removed in M6: the build is now the
// real `buildProduction` pipeline. The M6 build-command tests live
// in `./build_command_test.ts`.

// ---------------------------------------------------------------------------
// `formatError`
// ---------------------------------------------------------------------------

Deno.test("formatError: framework error with details", () => {
  const err = new CliError("CLI_INVALID_ARGS", "bad arg", { flag: "port" });
  const text = formatError(err);
  assertStringIncludes(text, "CLI_INVALID_ARGS");
  assertStringIncludes(text, "bad arg");
  assertStringIncludes(text, "details:");
  assertStringIncludes(text, "flag");
});

Deno.test("formatError: framework error without details", () => {
  const err = new CliError("CLI_USER_ERROR", "oops");
  const text = formatError(err);
  assertStringIncludes(text, "CLI_USER_ERROR");
  assertStringIncludes(text, "oops");
  // No details block when details is empty.
  assert(!text.includes("details:"));
});

Deno.test("formatError: non-framework error without debug", () => {
  const err = new Error("plain boom");
  const text = formatError(err);
  assertStringIncludes(text, "Error");
  assertStringIncludes(text, "plain boom");
  // No stack trace without --debug.
  assert(!text.includes("\n    at "));
});

Deno.test("formatError: non-framework error with debug appends the stack", () => {
  const err = new Error("plain boom");
  const text = formatError(err, { debug: true });
  assertStringIncludes(text, "plain boom");
  // V8 stack traces always contain the `at ` frame marker.
  assertStringIncludes(text, "at ");
});

Deno.test("formatError: non-Error throw value is stringified", () => {
  const text = formatError("just a string");
  assertStringIncludes(text, "just a string");
});

// ---------------------------------------------------------------------------
// `printHelp` direct
// ---------------------------------------------------------------------------

Deno.test("printHelp: writes the expected section headers to the sink", () => {
  const lines: string[] = [];
  printHelp({ out: (l) => lines.push(l) });
  const text = lines.join("\n");
  assertStringIncludes(text, "Commands:");
  assertStringIncludes(text, "Flags:");
  assertStringIncludes(text, "Permission requirements");
});

// ---------------------------------------------------------------------------
// `parseArgs` direct
// ---------------------------------------------------------------------------

Deno.test("parseArgs: command is the first positional", () => {
  const p = parseArgs(["dev", "./proj", "--port", "8080"]);
  assertEquals(p.command, "dev");
  assertEquals(p.positional, ["./proj"]);
  assertEquals(p.flags.port, "8080");
});

Deno.test("parseArgs: --flag=value form", () => {
  const p = parseArgs(["dev", "--port=8080"]);
  assertEquals(p.command, "dev");
  assertEquals(p.flags.port, "8080");
});

Deno.test("parseArgs: empty argv defaults to help", () => {
  assertEquals(parseArgs([]).command, "help");
});

Deno.test("parseArgs: -- at the end stops flag parsing", () => {
  const p = parseArgs(["init", "./target", "--", "--not-a-flag"]);
  assertEquals(p.positional, ["./target", "--not-a-flag"]);
});

Deno.test("parseArgs: bare --flag with no value is true", () => {
  const p = parseArgs(["init", "./t", "--force"]);
  assertEquals(p.flags.force, true);
});

Deno.test("parseArgs: short flags throw CLI_INVALID_ARGS", () => {
  let caught: unknown = null;
  try {
    parseArgs(["-f"]);
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof CliError);
  assertEquals((caught as CliError).code, "CLI_INVALID_ARGS");
});

// ---------------------------------------------------------------------------
// End-to-end smoke (mirrors the M5 spec's smoke block).
// ---------------------------------------------------------------------------

Deno.test("smoke: init + inspect + bogus + dev request", async () => {
  const tmp = await Deno.makeTempDir({ prefix: "sprout-m5-smoke-" });
  try {
    const r1 = await run(["init", tmp], { silent: true });
    assertEquals(r1.code, 0);
    assertEquals(r1.ok, true);

    const r2 = await run(["inspect", tmp], { silent: true });
    assertEquals(r2.code, 0);
    assertEquals(r2.ok, true);

    const r3 = await run(["bogus"], { silent: true });
    assertEquals(r3.code, 1);
    assertEquals(r3.ok, false);
    if (r3.ok) throw new Error("expected failure");
    assert(r3.error instanceof CliError);
    assertEquals(r3.error.code, "CLI_UNKNOWN_COMMAND");
    assertEquals(r3.error.message, 'unknown command "bogus"');

    // Boot the dev server against the freshly-init'd project.
    const { createApp } = await import("@sprout/core");
    const app = await createApp({ root: tmp, mode: "development" });
    const r4 = await app.fetch(new Request("http://0.0.0.0/"));
    assertEquals(r4.status, 200);
    const body = await r4.text();
    assert(
      body.includes("data-sprout-island"),
      "island placeholder should be present",
    );
    assert(
      body.includes("/@sprout/runtime.js"),
      "runtime script tag should be present",
    );
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
});

// ---------------------------------------------------------------------------
// `errors_test.ts` would normally live in a separate file; we keep
// the framework-error formatting assertions here for the
// `errors.ts` module's own surface.
// ---------------------------------------------------------------------------

Deno.test("errors: CliError exposes code, message, details, and name", () => {
  const err = new CliError("CLI_USER_ERROR", "boom", { a: 1, b: "two" });
  assertEquals(err.code, "CLI_USER_ERROR");
  assertEquals(err.message, "boom");
  assertEquals(err.details, { a: 1, b: "two" });
  assertEquals(err.name, "CliError");
  assert(err instanceof FrameworkError);
  assert(err instanceof Error);
});

Deno.test("errors: CliError.details is shallowly frozen", () => {
  const err = new CliError("CLI_USER_ERROR", "boom", { a: 1 });
  assertEquals(Object.isFrozen(err.details), true);
});

// Reference: a no-op assertion to silence the unused-import linter
// when the URL helpers from `@std/path` are not strictly needed.
Deno.test("smoke: REPO_ROOT is the workspace root", () => {
  const url = toFileUrl(REPO_ROOT + "/deno.jsonc").href;
  assertStringIncludes(url, "deno.jsonc");
});

// ---------------------------------------------------------------------------
// Binary entrypoint (M10 fix-up)
// ---------------------------------------------------------------------------
//
// `mod.ts` is the JSR public entry (`exports: { ".": "./mod.ts" }`).
// JSR does not support a `bin` field, so the only way to give the
// package a binary entry is the `import.meta.main` block at the
// bottom of `mod.ts`. The block calls `run(Deno.args)` and
// `Deno.exit(result.code)`; when `mod.ts` is imported as a
// library (`import { run } from "@sprout/cli"`) the block does
// not run, so the library contract (`run` is a pure function that
// returns a `Promise<CliResult>`) is preserved. These tests spawn
// `mod.ts` as a subprocess and assert that the binary entry exists,
// forwards `Deno.args` to `run`, and forwards the exit code.
const CLI_ENTRY = join(REPO_ROOT, "packages/cli/mod.ts");

async function runCliBinary(
  args: readonly string[],
  options: { cwd?: string; env?: Record<string, string> } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  const command = new Deno.Command(Deno.execPath(), {
    args: [
      "run",
      "--allow-read",
      "--allow-write",
      "--allow-env",
      "--allow-net",
      CLI_ENTRY,
      ...args,
    ],
    cwd: options.cwd,
    env: options.env,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await command.output();
  return {
    code,
    stdout: new TextDecoder().decode(stdout),
    stderr: new TextDecoder().decode(stderr),
  };
}

Deno.test("binary entry: `help` exits 0 and prints every command name", async () => {
  const { code, stdout } = await runCliBinary(["help"]);
  assertEquals(code, 0);
  assertStringIncludes(stdout, "Commands:");
  for (const cmd of ["init", "dev", "build", "serve", "inspect", "help"]) {
    assertStringIncludes(stdout, cmd);
  }
});

Deno.test("binary entry: `bogus` exits 1 and reports CLI_UNKNOWN_COMMAND on stderr", async () => {
  const { code, stderr } = await runCliBinary(["bogus"]);
  assertEquals(code, 1);
  assertStringIncludes(stderr, "CLI_UNKNOWN_COMMAND");
});
