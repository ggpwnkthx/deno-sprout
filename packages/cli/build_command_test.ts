// Tests for the M6 `sprout build` command in `@sprout/cli`.
//
// The tests drive the CLI through `run(["build", tmp])` against a
// tmp copy of the basic-app fixture, capture stdout, and assert on
// both the printed summary and the on-disk `outDir` layout.
//
// The M5 placeholder test for `build` was removed in M6: the build
// is now the real `buildProduction` pipeline. The M6 exit-criterion
// proof lives here.
import { assert, assertEquals, assertExists, assertStringIncludes } from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { CliError, run } from "./mod.ts";
import { FrameworkError } from "@sprout/utils";
import type { CliResult } from "./types.ts";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const FIXTURE = join(REPO_ROOT, "tests/fixtures/basic-app");

async function makeTempDir(
  prefix: string,
): Promise<{ readonly path: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({
    prefix,
    dir: join(REPO_ROOT, "tests/.tmp"),
  });
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

/** Replace `console.log` and `console.error` with an in-memory buffer. */
function captureConsole(): {
  readonly lines: readonly string[];
  readonly restore: () => void;
} {
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

/** Copy a small file from `src` to `dst`, creating parent dirs as needed. */
async function copyFile(src: string, dst: string): Promise<void> {
  const slashIdx = Math.max(dst.lastIndexOf("/"), dst.lastIndexOf("\\"));
  if (slashIdx > 0) {
    await Deno.mkdir(dst.slice(0, slashIdx), { recursive: true });
  }
  const data = await Deno.readFile(src);
  await Deno.writeFile(dst, data);
}

/**
 * Copy the basic-app fixture (excluding the `dist` and `.sprout`
 * directories) to a fresh tmp dir. The CLI runs against the copy.
 */
async function copyFixtureTo(target: string): Promise<void> {
  await Deno.mkdir(target, { recursive: true });
  // sprout.config.ts
  await copyFile(join(FIXTURE, "sprout.config.ts"), join(target, "sprout.config.ts"));
  // src/
  await Deno.mkdir(join(target, "src/routes"), { recursive: true });
  await Deno.mkdir(join(target, "src/islands/cart"), { recursive: true });
  await Deno.mkdir(join(target, "src/styles"), { recursive: true });
  for (
    const rel of [
      "src/routes/index.tsx",
      "src/routes/about.tsx",
      "src/routes/api/contact.ts",
      "src/routes/blog/index.tsx",
      "src/routes/blog/[slug].tsx",
      "src/routes/files/[...path].tsx",
      "src/islands/Counter.tsx",
      "src/islands/cart/AddButton.tsx",
      "src/styles/app.css",
    ]
  ) {
    await copyFile(join(FIXTURE, rel), join(target, rel));
  }
}

// ---------------------------------------------------------------------------
// buildProduction exits cleanly against the basic-app fixture
// ---------------------------------------------------------------------------

Deno.test("sprout build: writes a complete .sprout/dist and prints the summary", async () => {
  const tmp = await makeTempDir("sprout-m6-cli-build-");
  try {
    await copyFixtureTo(tmp.path);
    const spy = captureConsole();
    try {
      const r = await run(["build", tmp.path], { silent: false });
      assertEquals(r, { ok: true, code: 0 } satisfies CliResult);
      const text = spy.lines.join("\n");
      assertStringIncludes(text, "Built ");
      assertStringIncludes(text, ".sprout/dist");
      // Each canonical public path appears in the summary.
      assertStringIncludes(text, "/@sprout/runtime.js");
      assertStringIncludes(text, "/@sprout/app.css");
      assertStringIncludes(text, "/@sprout/island/Counter.js");
      assertStringIncludes(text, "/@sprout/island/cart/AddButton.js");
    } finally {
      spy.restore();
    }

    // The on-disk frozen manifest has the expected shape.
    const manifestPath = join(tmp.path, ".sprout/dist/sprout.manifest.json");
    const manifest = JSON.parse(await Deno.readTextFile(manifestPath));
    assertEquals(manifest.version, 1);
    assertExists(manifest.assets);
    assert(manifest.assets.length >= 4);

    // The hashed files exist under `_sprout/`.
    const sproutDir = join(tmp.path, ".sprout/dist/_sprout");
    const entries: string[] = [];
    for await (const e of Deno.readDir(sproutDir)) {
      entries.push(e.name);
    }
    assert(
      entries.some((f) => /^runtime\.[0-9a-f]{16}\.js$/.test(f)),
      `expected a hashed runtime file, got: ${entries.join(", ")}`,
    );
    assert(
      entries.some((f) => /^island-Counter\.[0-9a-f]{16}\.js$/.test(f)),
      `expected a hashed Counter island file, got: ${entries.join(", ")}`,
    );
    assert(
      entries.some((f) => /^island-cart-AddButton\.[0-9a-f]{16}\.js$/.test(f)),
      `expected a hashed cart/AddButton island file, got: ${entries.join(", ")}`,
    );
    assert(
      entries.some((f) => /^style-app\.[0-9a-f]{16}\.css$/.test(f)),
      `expected a hashed app stylesheet, got: ${entries.join(", ")}`,
    );
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// Unsafe outDir
// ---------------------------------------------------------------------------

Deno.test("sprout build: refuses unsafe outDir with BUILD_OUTDIR_UNSAFE", async () => {
  const tmp = await makeTempDir("sprout-m6-cli-unsafe-");
  try {
    await copyFixtureTo(tmp.path);
    const outDir = join(tmp.path, ".sprout/dist");
    await Deno.mkdir(outDir, { recursive: true });
    await Deno.writeTextFile(join(outDir, "bogus.txt"), "not sprout's");

    const r = await run(["build", tmp.path], { silent: true });
    assertEquals(r.ok, false);
    if (r.ok) throw new Error("expected failure");
    assertEquals(r.code, 1);
    assert(r.error instanceof FrameworkError);
    assertEquals(r.error.code, "BUILD_OUTDIR_UNSAFE");
    const details = r.error.details as { entries?: readonly string[] };
    assertExists(details.entries);
    assert(details.entries.includes("bogus.txt"));
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// gzip companions
// ---------------------------------------------------------------------------

Deno.test("sprout build: writes gzip companions when configured (default)", async () => {
  const tmp = await makeTempDir("sprout-m6-cli-gz-");
  try {
    await copyFixtureTo(tmp.path);
    const spy = captureConsole();
    try {
      const r = await run(["build", tmp.path], { silent: false });
      assertEquals(r.ok, true);
      const text = spy.lines.join("\n");
      // The default config has `build.compress === "gzip"`, so the
      // summary must mark the assets with `(+gzip)`.
      assertStringIncludes(text, "+gzip");
    } finally {
      spy.restore();
    }
    // The on-disk .gz companions exist.
    const sproutDir = join(tmp.path, ".sprout/dist/_sprout");
    const entries: string[] = [];
    for await (const e of Deno.readDir(sproutDir)) {
      entries.push(e.name);
    }
    assert(entries.some((f) => f.endsWith(".gz.js")));
    assert(entries.some((f) => f.endsWith(".gz.css")));
  } finally {
    await tmp.cleanup();
  }
});

Deno.test("sprout build: omits gzip companions when compress is false", async () => {
  const tmp = await makeTempDir("sprout-m6-cli-nogz-");
  try {
    await copyFixtureTo(tmp.path);
    // Overwrite the config so gzip is off.
    await Deno.writeTextFile(
      join(tmp.path, "sprout.config.ts"),
      "export default { build: { compress: false } };\n",
    );
    const spy = captureConsole();
    try {
      const r = await run(["build", tmp.path], { silent: false });
      assertEquals(r.ok, true);
      const text = spy.lines.join("\n");
      assert(!text.includes("+gzip"), "summary should not contain +gzip");
    } finally {
      spy.restore();
    }
    const sproutDir = join(tmp.path, ".sprout/dist/_sprout");
    const entries: string[] = [];
    for await (const e of Deno.readDir(sproutDir)) {
      entries.push(e.name);
    }
    assert(!entries.some((f) => f.endsWith(".gz.js")));
    assert(!entries.some((f) => f.endsWith(".gz.css")));
  } finally {
    await tmp.cleanup();
  }
});

// ---------------------------------------------------------------------------
// run-level error shape
// ---------------------------------------------------------------------------

Deno.test("sprout build: returns ok: false with code 1 for an unknown config import failure", async () => {
  const tmp = await makeTempDir("sprout-m6-cli-badcfg-");
  try {
    await Deno.writeTextFile(
      join(tmp.path, "sprout.config.ts"),
      "throw new Error('boom');\n",
    );
    const r = await run(["build", tmp.path], { silent: true });
    assertEquals(r.ok, false);
    if (r.ok) throw new Error("expected failure");
    assertEquals(r.code, 1);
    assert(r.error instanceof Error);
  } finally {
    await tmp.cleanup();
  }
});

// Reference: silence the unused-import linter when the type is not
// strictly needed.
Deno.test("imports: CliError is referenced for shape parity", () => {
  const e: CliError = new CliError("CLI_USER_ERROR", "x");
  assertEquals(e.code, "CLI_USER_ERROR");
});
