// M10 end-to-end smoke for the generated app.
//
// The script proves the M5 / M6 / M7 / M9 user stories hold for a
// real, freshly scaffolded Sprout project:
//
//   1. `sprout init <tmp>` — `run(["init", tmp], { silent: true })`
//      returns `ok: true`. This is the M5 init → dev exit criterion.
//   2. Rewrite the generated `deno.jsonc` so the framework imports
//      point at the workspace's local packages (the template's
//      `jsr:@sprout/*@0.2.0` URLs are valid only on a real JSR
//      publish — the M10 release candidate is the smoke gate that
//      keeps the publish honest, so the smoke itself cannot depend
//      on JSR). This mirrors what `tests/examples/examples_test.ts`
//      does for the same reason.
//   3. `loadConfig({ root: tmp, mode: "production" })` reads the
//      generated `sprout.config.ts`.
//   4. `buildProduction({ config })` writes
//      `<tmp>/.sprout/dist/sprout.manifest.json` with at least one
//      asset. This is the M6 build exit criterion.
//   5. `createApp({ root: tmp, mode: "production" })` boots the
//      production server against the tmp project. A `GET /` returns
//      200 with the framework's island placeholder HTML, the
//      `/@sprout/runtime.js` script tag, and the `/@sprout/app.css`
//      stylesheet link. This is the M7 serve exit criterion and
//      the M9 end-to-end smoke.
//
// The script cleans up the tmp directory in a `finally` block so
// even a mid-flight failure does not leave state behind. The
// `deno task smoke` invocation in the root `deno.jsonc` provides
// `--allow-read --allow-write --allow-env --allow-net
// --allow-run --allow-sys --allow-ffi` so the import resolver and
// dynamic import paths used by the generated app work end-to-end.
import { fromFileUrl, join, toFileUrl } from "@std/path";
import { run } from "@sprout/cli";
import { createApp } from "@sprout/core";
import { buildProduction } from "@sprout/compiler";
import { loadConfig } from "@sprout/config";

const REPO_ROOT = fromFileUrl(new URL("../", import.meta.url));
const workspaceImportUrl = (rel: string): string => toFileUrl(join(REPO_ROOT, rel)).href;

const tmp = await Deno.makeTempDir({ prefix: "sprout-m10-smoke-" });
try {
  // 1. Init. The init template writes a `deno.jsonc` whose
  //    `imports` block pins `jsr:@sprout/*@0.2.0` — valid only
  //    once the packages are published. For the smoke we
  //    override the import map to point at the local packages,
  //    so the build can resolve every framework module
  //    without a network round-trip.
  console.log("[smoke] init ->", tmp);
  const initResult = await run(["init", tmp], { silent: true });
  if (!initResult.ok) {
    throw new Error(
      `init failed: ${initResult.error?.message ?? "unknown error"}`,
    );
  }

  // 2. Rewrite the generated `deno.jsonc`. The structure mirrors
  //    the init template exactly; the import map is the only
  //    change. Tasks stay identical.
  const denoJsoncPath = join(tmp, "deno.jsonc");
  const denoJsonc = {
    tasks: {
      dev:
        "deno run --allow-read --allow-write --allow-env --allow-net --allow-run @sprout/cli dev",
      build:
        "deno run --allow-read --allow-write --allow-env --allow-net --allow-run @sprout/cli build",
      serve: "deno run --allow-read --allow-env --allow-net @sprout/cli serve",
    },
    compilerOptions: {
      strict: true,
      noUncheckedIndexedAccess: true,
      jsx: "react-jsx",
      jsxImportSource: "@sprout/jsx",
    },
    imports: {
      "@sprout/core": workspaceImportUrl("packages/core/mod.ts"),
      "@sprout/config": workspaceImportUrl("packages/config/mod.ts"),
      "@sprout/compiler": workspaceImportUrl("packages/compiler/mod.ts"),
      "@sprout/jsx": workspaceImportUrl("packages/jsx/mod.ts"),
      "@sprout/jsx/dom": workspaceImportUrl("packages/jsx/dom/mod.ts"),
      "@sprout/jsx/dom/jsx-runtime": workspaceImportUrl("packages/jsx/dom/jsx-runtime.ts"),
      "@sprout/jsx/dom/jsx-dev-runtime": workspaceImportUrl("packages/jsx/dom/jsx-runtime.ts"),
      "@sprout/jsx/shared": workspaceImportUrl("packages/jsx/shared/mod.ts"),
      "@sprout/jsx/server/island-registry": workspaceImportUrl(
        "packages/jsx/server/island-registry.ts",
      ),
      "@sprout/runtime": workspaceImportUrl("packages/runtime/mod.ts"),
      "@sprout/utils": workspaceImportUrl("packages/utils/mod.ts"),
    },
  };
  await Deno.writeTextFile(
    denoJsoncPath,
    JSON.stringify(denoJsonc, null, 2) + "\n",
  );

  // 3. Build.
  const config = await loadConfig({ root: tmp, mode: "production" });
  const outDir = config.outDir;
  console.log("[smoke] build ->", outDir);
  const summary = await buildProduction({ config });
  if (summary.assetsWritten < 1) {
    throw new Error(`build wrote no assets (got ${summary.assetsWritten})`);
  }
  console.log(
    `[smoke] build wrote ${summary.assetsWritten} assets, ${summary.bytes} bytes`,
  );

  // The frozen manifest must be on disk for the production serve
  // boot to succeed.
  const manifestPath = join(outDir, "sprout.manifest.json");
  const manifestText = await Deno.readTextFile(manifestPath);
  if (manifestText.length === 0) {
    throw new Error("frozen manifest is empty");
  }

  // 4. Serve (production mode). Boot the app against the tmp copy
  //    and request `/` plus every asset URL recorded in the
  //    manifest. The exact content-hashed filename is unknown
  //    until the build runs, so we resolve via the on-disk
  //    manifest.
  console.log("[smoke] serve -> request /");
  const app = await createApp({ root: tmp, mode: "production" });

  const rootRes = await app.fetch(new Request("http://0.0.0.0/"));
  if (rootRes.status !== 200) {
    const body = await rootRes.text();
    throw new Error(`GET / -> ${rootRes.status}\nbody: ${body}`);
  }
  const body = await rootRes.text();
  if (!body.includes("data-sprout-island")) {
    throw new Error("GET / did not include the island placeholder");
  }
  if (!body.includes("/@sprout/runtime.js")) {
    throw new Error("GET / did not include the runtime script tag");
  }
  if (!body.includes("/@sprout/app.css")) {
    throw new Error("GET / did not include the stylesheet link tag");
  }

  const manifest = JSON.parse(manifestText) as {
    readonly version: number;
    readonly assets: readonly { readonly publicPath: string }[];
  };
  for (const asset of manifest.assets) {
    const res = await app.fetch(
      new Request(`http://0.0.0.0${asset.publicPath}`),
    );
    if (res.status !== 200) {
      throw new Error(
        `GET ${asset.publicPath} -> ${res.status} (expected 200)`,
      );
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength === 0) {
      throw new Error(
        `GET ${asset.publicPath} returned an empty body (expected bytes)`,
      );
    }
  }

  console.log(`[smoke] OK — ${manifest.assets.length} assets verified`);
} finally {
  try {
    await Deno.remove(tmp, { recursive: true });
  } catch (_cause) {
    // best-effort cleanup
  }
}
