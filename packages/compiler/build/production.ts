// M6 production build: the `buildProduction` entry point and the
// `formatBuildSummary` formatter.
//
// The build runs the same M2 `discoverProject + validateManifest`
// pipeline as the dev server, then iterates over the manifest's
// runtime, islands, and stylesheet, calling `compileDevAsset` once
// per asset (with `mode: "production"` so the dev cache is
// partitioned), writes the content-hashed file under
// `<outDir>/_sprout/`, optionally writes a `.gz` companion, and
// finally writes `<outDir>/sprout.manifest.json`.
//
// Server routes are NOT bundled: the M3 spec explicitly says
// "For the initial release, production may still import route
// source files directly at runtime", so the build ignores
// `manifest.routes` and the runtime dispatch still imports
// the source files at request time.
//
// Vendor bundle support is intentionally absent: the MVP has no
// shared vendor feature flag. The `FrozenAsset.kind` union
// includes `"vendor"` for forward compatibility, but no
// `vendor.<hash>.js` is written by M6.
import type { ResolvedConfig } from "@sprout/config";
import { compileDevAsset } from "./dev_assets.ts";
import {
  contentTypeFor,
  emptyOutDir,
  ensureSafeOutDir,
  unsafeOutDirError,
  writeHashedAsset,
} from "./frozen_assets.ts";
import { writeFrozenManifest } from "./frozen_manifest.ts";
import { resolveRuntimeEntryFile } from "../source_paths.ts";
import { discoverProject } from "../discover/project.ts";
import { validateManifest } from "../manifest/validate.ts";
import type { FrozenAsset, FrozenManifest } from "../manifest/types.ts";

/**
 * Inputs to {@link buildProduction}.
 */
export type BuildOptions = {
  readonly config: ResolvedConfig;
};

/**
 * The structured result of a successful build. `assetsWritten` is
 * the count of on-disk `FrozenAsset` entries; `gzipAssets` is the
 * subset with a `gzipFile` companion; `bytes` is the total raw bytes
 * written (gzipped bytes are NOT counted in this total — the raw
 * asset size is what the manifest is sized against).
 */
export type BuildSummary = {
  readonly manifest: FrozenManifest;
  readonly outDir: string;
  readonly assetsWritten: number;
  readonly gzipAssets: number;
  readonly bytes: number;
};

/**
 * Run the M6 production build. The function:
 *
 *   1. Resolves the project (`discoverProject + validateManifest`).
 *   2. Classifies `outDir` as `missing` / `empty` / `prior-manifest`
 *      / `unsafe`. `unsafe` throws `BUILD_OUTDIR_UNSAFE`; the
 *      other three proceed after the create / empty step.
 *   3. Compiles the runtime, every island, and (when configured)
 *      the app stylesheet via `compileDevAsset({ mode: "production" })`.
 *      The dev cache is reused; the `mode` partition keeps dev and
 *      prod cache entries from colliding.
 *   4. Writes each compiled asset under `<outDir>/_sprout/`, with
 *      a `.gz` companion when `config.build.compress === "gzip"`.
 *   5. Writes `<outDir>/sprout.manifest.json`.
 *   6. Returns the typed `BuildSummary` for the CLI / tests.
 *
 * Server routes are deliberately not bundled. Vendor bundles are
 * deliberately not emitted (the MVP has no shared vendor feature
 * flag).
 */
export async function buildProduction(
  opts: BuildOptions,
): Promise<BuildSummary> {
  const config = opts.config;
  const project = await discoverProject(config);
  const manifest = validateManifest(project);

  // 1. Classify outDir.
  const safety = await ensureSafeOutDir(config.outDir);
  if (safety === "unsafe") {
    const entries: string[] = [];
    try {
      for await (const e of Deno.readDir(config.outDir)) {
        entries.push(e.name);
      }
    } catch (_cause) {
      // best-effort
    }
    unsafeOutDirError(config.outDir, entries);
  }
  if (safety === "missing") {
    await Deno.mkdir(config.outDir, { recursive: true });
  } else if (safety === "prior-manifest") {
    await emptyOutDir(config.outDir);
  }

  // 2. Compile each asset kind and write the hashed files.
  const compress = config.build.compress;
  const assets: FrozenAsset[] = [];
  let totalBytes = 0;

  // 2a. Runtime.
  {
    const result = await compileDevAsset({
      kind: "runtime",
      id: "runtime",
      entry: resolveRuntimeEntryFile(),
      publicPath: "/@sprout/runtime.js",
      jsxImportSource: "@sprout/jsx/dom",
      config,
      mode: "production",
    });
    const asset = await writeHashedAsset({
      outDir: config.outDir,
      kind: "runtime",
      id: "runtime",
      publicPath: "/@sprout/runtime.js",
      contentType: result.contentType,
      bytes: result.js,
      compress,
    });
    assets.push(asset);
    totalBytes += result.js.byteLength;
  }

  // 2b. Islands.
  for (const island of project.islands) {
    const result = await compileDevAsset({
      kind: "island",
      id: island.id,
      entry: island.file,
      publicPath: island.publicPath,
      jsxImportSource: "@sprout/jsx/dom",
      config,
      mode: "production",
    });
    const asset = await writeHashedAsset({
      outDir: config.outDir,
      kind: "island",
      id: island.id,
      publicPath: island.publicPath,
      contentType: result.contentType,
      bytes: result.js,
      compress,
    });
    assets.push(asset);
    totalBytes += result.js.byteLength;
  }

  // 2c. App stylesheet (if present).
  if (manifest.styles.app !== null) {
    const styleEntry = manifest.styles.app;
    const result = await compileDevAsset({
      kind: "style",
      id: styleEntry.id,
      entry: styleEntry.file,
      publicPath: styleEntry.publicPath,
      jsxImportSource: "@sprout/jsx",
      config,
      mode: "production",
    });
    const asset = await writeHashedAsset({
      outDir: config.outDir,
      kind: "style",
      id: styleEntry.id,
      publicPath: styleEntry.publicPath,
      // The result content type is the dev asset's resolved type
      // (`text/css; charset=utf-8`). Re-deriving it from the file
      // name matches the M6 writeup so the on-disk `FrozenAsset`
      // does not depend on the dev compile's content-type map.
      contentType: contentTypeFor(styleEntry.file),
      bytes: result.js,
      compress,
    });
    assets.push(asset);
    totalBytes += result.js.byteLength;
  }

  // 3. Sort for determinism (kind → id).
  assets.sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind < b.kind ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  const frozenManifest: FrozenManifest = {
    version: 1,
    assets,
  };

  // 4. Write the manifest.
  await writeFrozenManifest(config.outDir, frozenManifest);

  const gzipAssets = assets.filter((a) => a.gzipFile !== undefined).length;
  return {
    manifest: frozenManifest,
    outDir: config.outDir,
    assetsWritten: assets.length,
    gzipAssets,
    bytes: totalBytes,
  };
}

/**
 * Format a `BuildSummary` as the human-readable multi-line string
 * the CLI prints. The shape mirrors the example in
 * `docs/sprout/production-build.md`:
 *
 * ```text
 * Built 5 assets into .sprout/dist
 *   runtime  /@sprout/runtime.js
 *   style    /@sprout/app.css
 *   island   /@sprout/island/Counter.js
 * ```
 *
 * The kind column is left-padded to 8 characters, then a single
 * separator space, then the public path, then two spaces, then
 * the on-disk hashed filename (basename of `asset.file`). When
 * `asset.gzipFile` is present, ` (+gzip)` is appended to the row.
 *
 * The output ends with a single trailing newline.
 */
export function formatBuildSummary(summary: BuildSummary): string {
  const lines: string[] = [];
  lines.push(`Built ${summary.assetsWritten} assets into ${summary.outDir}`);
  for (const asset of summary.manifest.assets) {
    const kind = asset.kind.padEnd(8, " ");
    const base = asset.file.startsWith("_sprout/")
      ? asset.file.slice("_sprout/".length)
      : asset.file;
    const gzip = asset.gzipFile !== undefined ? "  (+gzip)" : "";
    lines.push(`  ${kind} ${asset.publicPath}  ${base}${gzip}`);
  }
  return lines.join("\n") + "\n";
}
