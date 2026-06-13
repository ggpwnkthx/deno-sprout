// Cross-package integration test: boot every M9 example through
// the real `buildProduction` + `createApp({ mode: "production" })`
// pipeline and assert the dev / prod wire contract holds for each.
//
// The test is intentionally opt-in. It is NOT discovered by
// `deno task test` because the `tests/examples` directory is in
// the workspace's `exclude` list. The test needs its own
// `deno.json` (at `tests/examples/deno.json`) so the test
// process is not a workspace member and the Deno loader's
// workspace-discovery step does not expect the example's
// `deno.jsonc` to be a member of the workspace. Run it with:
//
//   deno test --allow-all --no-check --config tests/examples/deno.json tests/examples/examples_test.ts
//
// The `--no-check` flag skips the workspace-wide type check
// (the test deliberately does not run the same TypeScript
// strictness gate the workspace uses; it is a smoke test).
//
// The test scope is "does the example render, do the framework
// assets exist, does the public file serve". It is not a full
// browser-side mount test; the islands are verified to compile
// and serve (the dev / prod asset pipeline), not to actually
// mount in a real browser (no DOM here).
import { assert, assertEquals, assertStringIncludes } from "@std/assert";
import { fromFileUrl, join } from "@std/path";
import { loadConfig } from "@sprout/config";
import { buildProduction } from "@sprout/compiler";
import { createApp } from "@sprout/core";

const REPO_ROOT = fromFileUrl(new URL("../../", import.meta.url));
const EXAMPLES_DIR = join(REPO_ROOT, "examples");

/** A single M9 example, with the assertions we want to run against it. */
type ExampleSpec = {
  /** Directory name under `examples/`. */
  readonly name: string;
  /** Public-path fragments that must be present in the manifest. */
  readonly expectedPublicPaths: readonly string[];
  /** Public files the test expects to fetch. */
  readonly publicFiles: readonly string[];
  /** URL paths the test expects to render (status, content includes). */
  readonly routes: readonly {
    readonly path: string;
    readonly includes: readonly string[];
  }[];
};

/** The M9 example matrix. The order is the test order. */
const EXAMPLES: readonly ExampleSpec[] = [
  {
    name: "basic",

    expectedPublicPaths: [
      "/@sprout/runtime.js",
      "/@sprout/app.css",
      "/@sprout/island/Counter.js",
    ],
    publicFiles: ["/favicon.svg"],
    routes: [
      {
        path: "/",
        includes: ["Hello, Sprout!", 'data-sprout-island="Counter"'],
      },
    ],
  },
  {
    name: "blog",

    expectedPublicPaths: [
      "/@sprout/runtime.js",
      "/@sprout/app.css",
      "/@sprout/island/LikeButton.js",
    ],
    publicFiles: ["/favicon.svg"],
    routes: [
      {
        path: "/",
        includes: ["Sprout Blog", "hello-sprout"],
      },
      {
        path: "/blog/hello-sprout",
        includes: ["Hello, Sprout!", 'data-sprout-island="LikeButton"'],
      },
      {
        path: "/blog/does-not-exist",
        includes: ["Not found"],
      },
      {
        path: "/api/posts",
        includes: ['"posts"'],
      },
    ],
  },
  {
    name: "forms",

    expectedPublicPaths: [
      "/@sprout/runtime.js",
      "/@sprout/app.css",
      "/@sprout/island/ContactCounter.js",
    ],
    publicFiles: ["/favicon.svg"],
    routes: [
      {
        path: "/",
        includes: ["Contact us", 'data-sprout-island="ContactCounter"'],
      },
      {
        path: "/api/contact",
        includes: ['"count"'],
      },
    ],
  },
  {
    name: "nested-routes",
    // The nested-routes example has no islands — it is route-shape only.

    expectedPublicPaths: ["/@sprout/runtime.js", "/@sprout/app.css"],
    publicFiles: ["/favicon.svg"],
    routes: [
      {
        path: "/",
        includes: ["Sprout nested routes"],
      },
      {
        path: "/blog/hello-world",
        includes: ["hello-world", "props.params.slug"],
      },
      {
        // The M3 catch-all pattern is translated to a single
        // Hono segment (the regex constraint is dropped), so the
        // catch-all only matches a single segment. The
        // `examples/nested-routes/` example documents this in
        // its README; the M7 spec promises to revisit.
        path: "/files/readme.txt",
        includes: ["readme.txt", "props.params.path"],
      },
      // The example also ships `(marketing)/about.tsx` and
      // `(marketing)/careers.tsx` to document the route-group
      // pattern. The M2 discovery layer skips files inside a
      // `(name)/` directory (route groups are a post-MVP
      // feature), so the M3 server returns 404 for `/about` and
      // `/careers`. The example README explains the limitation.
    ],
  },
  {
    name: "island-composition",

    expectedPublicPaths: [
      "/@sprout/runtime.js",
      "/@sprout/app.css",
      "/@sprout/island/Counter.js",
      "/@sprout/island/Timer.js",
      "/@sprout/island/ThemeToggle.js",
    ],
    publicFiles: ["/favicon.svg"],
    routes: [
      {
        path: "/",
        includes: [
          "Three islands",
          'data-sprout-island="Counter"',
          'data-sprout-island="Timer"',
          'data-sprout-island="ThemeToggle"',
        ],
      },
    ],
  },
];

/**
 * Copy a small file from `src` to `dst`, creating parent dirs as needed.
 * Used to seed a fresh tmp directory for each example.
 */
async function copyFile(src: string, dst: string): Promise<void> {
  const slashIdx = Math.max(dst.lastIndexOf("/"), dst.lastIndexOf("\\"));
  if (slashIdx > 0) {
    await Deno.mkdir(dst.slice(0, slashIdx), { recursive: true });
  }
  const data = await Deno.readFile(src);
  await Deno.writeFile(dst, data);
}

/**
 * Write the example's `deno.jsonc` with the JSR import map
 * replaced by local-path imports. The M9 examples use the
 * literal `@0.2.0` JSR versions (a placeholder until M10's
 * release automation pins real versions); the test rewrites the
 * import map to point at the workspace's local packages so the
 * build pipeline resolves the imports.
 *
 * The tasks, compiler options, and structure are otherwise
 * identical to the example's deno.jsonc.
 */
async function writeExampleDenoConfig(
  tmp: string,
  imports: Record<string, string>,
): Promise<void> {
  const deno = {
    tasks: {
      dev:
        "deno run --allow-read --allow-write --allow-env --allow-net --allow-run jsr:@sprout/cli@0.2.0 dev",
      build:
        "deno run --allow-read --allow-write --allow-env --allow-net --allow-run jsr:@sprout/cli@0.2.0 build",
      serve:
        "deno run --allow-read --allow-env --allow-net jsr:@sprout/cli@0.2.0 serve",
    },
    // The example's JSX is server-side: `jsxImportSource` must
    // point at `@sprout/jsx` (the server runtime). The compiler
    // sets `@sprout/jsx/dom` for island bundles automatically
    // (see `packages/compiler/build/production.ts`).
    compilerOptions: {
      strict: true,
      noUncheckedIndexedAccess: true,
      jsx: "react-jsx",
      jsxImportSource: "@sprout/jsx",
    },
    imports,
  };
  await Deno.writeTextFile(
    join(tmp, "deno.jsonc"),
    JSON.stringify(deno, null, 2) + "\n",
  );
}

/**
 * Recursively copy the example at `exampleDir` into a fresh tmp
 * directory under the system temp directory (NOT under the
 * workspace). The Deno resolver plugin walks up from each source
 * file looking for a `deno.json(c)`. If the example's
 * `deno.jsonc` lives inside the workspace tree, the plugin
 * expects it to be a workspace member and fails; the test's
 * copy lives outside the workspace to avoid that.
 *
 * Returns the new directory path.
 */
async function copyExampleTo(
  exampleDir: string,
  prefix: string,
  imports: Record<string, string>,
): Promise<string> {
  const tmp = await Deno.makeTempDir({ prefix });

  // Top-level files: `sprout.config.ts`, `README.md`. The
  // `deno.jsonc` is rewritten below with a workspace-friendly
  // import map.
  for (const top of ["sprout.config.ts", "README.md"]) {
    const src = join(exampleDir, top);
    try {
      await copyFile(src, join(tmp, top));
    } catch (_cause) {
      // README.md is optional.
      if (top !== "README.md") throw _cause;
    }
  }
  await writeExampleDenoConfig(tmp, imports);

  // src/
  await Deno.mkdir(join(tmp, "src"), { recursive: true });
  for await (const entry of Deno.readDir(join(exampleDir, "src"))) {
    if (!entry.isDirectory) {
      await copyFile(
        join(exampleDir, "src", entry.name),
        join(tmp, "src", entry.name),
      );
      continue;
    }
    await copyDir(
      join(exampleDir, "src", entry.name),
      join(tmp, "src", entry.name),
    );
  }

  // public/
  await Deno.mkdir(join(tmp, "public"), { recursive: true });
  for await (const entry of Deno.readDir(join(exampleDir, "public"))) {
    if (entry.isFile) {
      await copyFile(
        join(exampleDir, "public", entry.name),
        join(tmp, "public", entry.name),
      );
    }
  }

  return tmp;
}

/**
 * The workspace-friendly import map for the example test. Every
 * `@sprout/*` import points at the local package via an absolute
 * `file://` URL. The relative-path form (e.g. `../../packages/...`)
 * would resolve relative to the example's `deno.jsonc` in the
 * tmp directory, not to the workspace; absolute URLs make the
 * mapping stable across copies.
 */
function workspaceImports(): Record<string, string> {
  const base = new URL("file://" + REPO_ROOT + "/");
  const u = (rel: string) => new URL(rel, base).href;
  return {
    "@sprout/core": u("packages/core/mod.ts"),
    "@sprout/config": u("packages/config/mod.ts"),
    "@sprout/compiler": u("packages/compiler/mod.ts"),
    "@sprout/jsx": u("packages/jsx/mod.ts"),
    "@sprout/jsx/dom": u("packages/jsx/dom/mod.ts"),
    "@sprout/jsx/dom/jsx-runtime": u("packages/jsx/dom/jsx-runtime.ts"),
    "@sprout/jsx/dom/jsx-dev-runtime": u("packages/jsx/dom/jsx-runtime.ts"),
    "@sprout/jsx/shared": u("packages/jsx/shared/mod.ts"),
    "@sprout/jsx/server/island-registry": u(
      "packages/jsx/server/island-registry.ts",
    ),
    "@sprout/runtime": u("packages/runtime/mod.ts"),
    "@sprout/utils": u("packages/utils/mod.ts"),
  };
}

/** Recursive copy of a directory. */
async function copyDir(srcDir: string, dstDir: string): Promise<void> {
  await Deno.mkdir(dstDir, { recursive: true });
  for await (const entry of Deno.readDir(srcDir)) {
    const s = join(srcDir, entry.name);
    const d = join(dstDir, entry.name);
    if (entry.isDirectory) {
      await copyDir(s, d);
    } else if (entry.isFile) {
      await copyFile(s, d);
    }
  }
}

/** Best-effort cleanup of a tmp directory. */
async function cleanup(path: string): Promise<void> {
  try {
    await Deno.remove(path, { recursive: true });
  } catch (_cause) {
    // best-effort
  }
}

// ---------------------------------------------------------------------------
// Per-example build + serve smoke test
// ---------------------------------------------------------------------------

for (const example of EXAMPLES) {
  Deno.test(`examples/${example.name}: build + serve pipeline boots cleanly`, async () => {
    const exampleDir = join(EXAMPLES_DIR, example.name);
    const tmp = await copyExampleTo(
      exampleDir,
      `sprout-m9-examples-${example.name}-`,
      workspaceImports(),
    );

    try {
      // 1. Resolve the config from the tmp copy.
      const config = await loadConfig({ root: tmp, mode: "production" });
      assertEquals(config.root, slashTrailing(tmp));

      // 2. Run the production build.
      const summary = await buildProduction({ config });
      assert(
        summary.assetsWritten >= 2,
        `expected at least 2 assets, got ${summary.assetsWritten}`,
      );

      // 3. Boot the production app against the tmp copy.
      const app = await createApp({ root: tmp, mode: "production" });

      // 4. Walk each example route and assert the response.
      for (const route of example.routes) {
        const res = await app.fetch(
          new Request(`http://localhost${route.path}`),
        );
        if (res.status !== 200) {
          const body = await res.text();
          throw new Error(
            `expected 200 for ${route.path} in example/${example.name}, got ${res.status}\nbody: ${body}`,
          );
        }
        const body = await res.text();
        for (const needle of route.includes) {
          assertStringIncludes(
            body,
            needle,
            `expected ${route.path} body in example/${example.name} to include ${
              JSON.stringify(needle)
            }`,
          );
        }
      }

      // 5. Walk each framework asset URL and assert it serves from the
      //    manifest. (The exact hash in the URL is unknown until the
      //    build runs, so we resolve via the on-disk manifest.)
      const manifest = JSON.parse(
        await Deno.readTextFile(join(tmp, ".sprout/dist/sprout.manifest.json")),
      ) as { version: number; assets: readonly { publicPath: string }[] };
      assertEquals(manifest.version, 1);
      const publicPaths = new Set(manifest.assets.map((a) => a.publicPath));
      for (const p of example.expectedPublicPaths) {
        assert(
          publicPaths.has(p),
          `expected public path ${p} in example/${example.name} manifest, got: ${
            [...publicPaths].join(", ")
          }`,
        );
        const res = await app.fetch(new Request(`http://localhost${p}`));
        assertEquals(
          res.status,
          200,
          `expected 200 for ${p} in example/${example.name}, got ${res.status}`,
        );
        const bytes = new Uint8Array(await res.arrayBuffer());
        assert(
          bytes.byteLength > 0,
          `expected non-empty body for ${p} in example/${example.name}`,
        );
      }

      // 6. Walk each public file URL and assert it serves.
      for (const f of example.publicFiles) {
        const res = await app.fetch(new Request(`http://localhost${f}`));
        assertEquals(
          res.status,
          200,
          `expected 200 for ${f} in example/${example.name}, got ${res.status}`,
        );
      }

      // 7. Sanity-check the cache-control header for framework assets.
      const runtimePath = "/@sprout/runtime.js";
      const runtimeRes = await app.fetch(
        new Request(`http://localhost${runtimePath}`),
      );
      const cacheControl = runtimeRes.headers.get("cache-control") ?? "";
      assertStringIncludes(
        cacheControl,
        "immutable",
        `expected immutable cache-control on ${runtimePath} in example/${example.name}`,
      );
    } finally {
      await cleanup(tmp);
    }
  });
}

// ---------------------------------------------------------------------------
// Helper: slash-normalize a tmp path for comparison against the resolved
// config. The config layer normalizes trailing slashes away; this helper
// matches the same convention so the equality check is meaningful.
// ---------------------------------------------------------------------------

function slashTrailing(p: string): string {
  return p.endsWith("/") ? p.slice(0, -1) : p;
}

