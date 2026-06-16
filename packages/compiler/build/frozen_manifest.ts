// Frozen manifest writer for the M6 production build.
//
// The on-disk shape and the in-memory typed view are identical: the
// literal-type `kind` field on `FrozenAsset` survives a
// `JSON.stringify` round-trip losslessly, so the writer just dumps
// the typed `FrozenManifest` to `<outDir>/sprout.manifest.json` and
// M7's `loadFrozenIndex` reads the same JSON into the same shape.
import { join } from "@std/path";
import type { FrozenManifest } from "../manifest/types.ts";

/**
 * Write the frozen manifest to `<outDir>/sprout.manifest.json`.
 *
 * The file is written with `Deno.writeTextFile` (UTF-8 text) and a
 * two-space indent so a hand-inspector can read it. `JSON.stringify`
 * is deterministic for the typed `FrozenManifest` shape, so the file
 * is reproducible across runs that produce the same asset bytes.
 */
export async function writeFrozenManifest(
  outDir: string,
  manifest: FrozenManifest,
): Promise<void> {
  const path = join(outDir, "sprout.manifest.json");
  const json = JSON.stringify(manifest, null, 2);
  await Deno.writeTextFile(path, json);
}
