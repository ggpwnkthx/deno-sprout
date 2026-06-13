// Frozen manifest writer for the M6 production build.
//
// The on-disk shape and the in-memory typed view are identical: the
// literal-type `kind` field on `FrozenAsset` survives a
// `JSON.stringify` round-trip losslessly, so the writer just dumps
// the typed `FrozenManifest` to `<outDir>/sprout.manifest.json` and
// M7's `loadFrozenIndex` reads the same JSON into the same shape.
//
// The two `*Json` aliases below document the on-disk contract. They
// use plain `string` for `kind` (not a literal-type union) so future
// versions can add new kinds without a typed-schema migration: the
// loader validates the kind against the closed union and refuses
// unknown values. For M6 the writer just `JSON.stringify`s the typed
// `FrozenManifest`; the file happens to match the typed shape.
import { join } from "@std/path";
import type { FrozenManifest } from "../manifest/types.ts";

/**
 * On-disk JSON shape of a single asset. Kept as a structural alias
 * of the typed `FrozenAsset` (modulo the `kind` widening to `string`)
 * so the writer does not have to massage the object. M7's reader
 * narrows `kind` back to the literal-type union.
 */
export type FrozenAssetJson = {
  readonly kind: string;
  readonly id: string;
  readonly publicPath: string;
  readonly file: string;
  readonly contentType: string;
  readonly hash: string;
  readonly gzipFile?: string;
};

/** On-disk JSON shape of the full manifest. */
export type FrozenManifestJson = {
  readonly version: 1;
  readonly assets: readonly FrozenAssetJson[];
};

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
