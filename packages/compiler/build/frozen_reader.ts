// Frozen asset reader for the M7 production serve.
//
// `readFrozenAsset` returns the raw bytes and (when present) the
// gzip companion bytes of a single frozen asset. The reader is
// stateless: every call re-loads the manifest via `loadFrozenIndex`
// and re-reads the on-disk files. The serve layer is expected to
// cache the `FrozenIndex` once at startup and call this helper
// only on a cache miss.
//
// Reading the manifest on every call keeps the helper honest
// (its pre-condition is "the manifest is well-formed") and avoids
// a hidden process-global in `@sprout/compiler`. The serve layer
// owns the index lifetime; the helper owns the byte I/O.
import { join } from "@std/path";
import { CompilerError } from "../errors.ts";
import { loadFrozenIndex } from "./frozen_index.ts";

/**
 * The result of reading a single frozen asset.
 *
 * `bytes` is always set: it is the raw, content-hashed asset
 * bytes the framework serves to clients that did not request
 * gzip. `gzipBytes` is set only when the manifest records a
 * `gzipFile` companion AND the on-disk file is present; a missing
 * companion is degraded to `null` (with a `console.warn`) per the
 * M7 spec's "missing gzip companion degrades to raw asset" rule.
 *
 * `hash` is the 16-character lowercase-hex content hash the
 * serve layer wraps in a strong `ETag`.
 */
export type ReadFrozenAssetResult = {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly hash: string;
  readonly gzipBytes: Uint8Array | null;
};

/**
 * Read a single frozen asset's bytes (raw and optionally gzip).
 *
 * Throws `FROZEN_MANIFEST_MISSING` when the manifest file is
 * missing, `FROZEN_MANIFEST_UNSUPPORTED` when the manifest is
 * malformed or `publicPath` is not in the manifest, and a generic
 * `CompilerError("FROZEN_MANIFEST_UNSUPPORTED", ...)` when the
 * on-disk file is missing. A missing gzip companion degrades to
 * `null` (with a `console.warn`) rather than throwing.
 */
export async function readFrozenAsset(
  outDir: string,
  publicPath: string,
): Promise<ReadFrozenAssetResult> {
  if (typeof outDir !== "string" || outDir.length === 0) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "outDir must be a non-empty string",
      { outDir },
    );
  }
  if (typeof publicPath !== "string" || publicPath.length === 0) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "publicPath must be a non-empty string",
      { outDir, publicPath },
    );
  }

  // Load the index. This re-validates the manifest on every call;
  // the serve layer is expected to hold a single `FrozenIndex` in
  // a closure and call this helper only on a miss. The double
  // work is intentional: the helper is the byte-I/O layer, not
  // the index-cache layer.
  const index = await loadFrozenIndex(outDir);
  const asset = index.assets.get(publicPath);
  if (asset === undefined) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "publicPath not in frozen manifest",
      { outDir, publicPath },
    );
  }

  // Read the raw asset bytes.
  const filePath = join(outDir, asset.file);
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(filePath);
  } catch (_cause) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "frozen asset file is missing on disk",
      { outDir, publicPath, file: filePath },
    );
  }
  if (!stat.isFile) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "frozen asset path is not a regular file",
      { outDir, publicPath, file: filePath },
    );
  }
  const bytes = await Deno.readFile(filePath);

  // Read the gzip companion when present. A missing file is
  // degraded to `null` per the M7 spec; the asset is still
  // servable as raw bytes.
  let gzipBytes: Uint8Array | null = null;
  if (asset.gzipFile !== undefined) {
    const gzipPath = join(outDir, asset.gzipFile);
    try {
      const gzStat = await Deno.stat(gzipPath);
      if (gzStat.isFile) {
        gzipBytes = await Deno.readFile(gzipPath);
      } else {
        console.warn(
          `[sprout] gzip companion ${gzipPath} is not a regular file; serving raw asset for ${publicPath}`,
        );
      }
    } catch (_cause) {
      console.warn(
        `[sprout] gzip companion ${gzipPath} is missing on disk; serving raw asset for ${publicPath}`,
      );
    }
  }

  return {
    bytes,
    contentType: asset.contentType,
    hash: asset.hash,
    gzipBytes,
  };
}
