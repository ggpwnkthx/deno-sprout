// Frozen asset reader for the M7 production serve.
//
// `readFrozenAsset` takes a pre-built `FrozenIndex` (typically
// built once at process start by `loadFrozenIndex` and held in a
// closure for the lifetime of the serve loop) and returns the raw
// bytes and (when present) the gzip companion bytes of a single
// frozen asset. The helper does NOT re-parse the manifest on
// every call; that is the serve layer's job.
//
// `readFrozenAssetFromOutDir` is a thin convenience wrapper that
// calls `loadFrozenIndex` first, then `readFrozenAsset`. Use it
// when you have an `outDir` and a one-shot read (CLI tools, tests).
// The serve layer should build the index once and pass it
// directly to `readFrozenAsset`.
import { assert } from "jsr:@std/assert@1";
import { join } from "@std/path";
import { CompilerError } from "../errors.ts";
import { type FrozenIndex } from "../manifest/types.ts";
import { loadFrozenIndex } from "./frozen_index.ts";

/**
 * The LRU caps the total cache size, but a single oversized asset can
 * still blow past the cap momentarily when read into a Uint8Array.
 * This constant is the per-asset upper bound for the buffered read;
 * assets larger than this must be served via the streaming path (future
 * work) and reject with `FROZEN_ASSET_TOO_LARGE`.
 */
export const FROZEN_ASSET_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

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
 * The caller passes a pre-built `FrozenIndex` (typically built
 * once at process start by `loadFrozenIndex` and held in a
 * closure for the lifetime of the serve loop). The helper
 * does NOT re-parse the manifest on every call; that is the
 * serve layer's job.
 *
 * Throws `FROZEN_MANIFEST_MISSING` when the manifest file is
 * missing, `FROZEN_MANIFEST_UNSUPPORTED` when the manifest is
 * malformed or `publicPath` is not in the manifest, and a
 * `CompilerError("FROZEN_MANIFEST_UNSUPPORTED", ...)` when the
 * on-disk file is missing. A missing gzip companion degrades to
 * `null` (with a `console.warn`) rather than throwing.
 */
export async function readFrozenAsset(
  index: FrozenIndex,
  publicPath: string,
  maxBufferBytes?: number,
): Promise<ReadFrozenAssetResult> {
  assert(index !== null && index !== undefined, "index must be a FrozenIndex");
  const outDir = index.outDir;
  if (typeof publicPath !== "string" || publicPath.length === 0) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "publicPath must be a non-empty string",
      { outDir, publicPath },
    );
  }

  // The caller already built the FrozenIndex (typically once at
  // process start). The byte-I/O helper does NOT re-parse the
  // manifest on every call; that is the serve layer's job.
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
      "FROZEN_ASSET_MISSING",
      "frozen asset file is missing on disk",
      { outDir, publicPath, file: filePath },
    );
  }
  if (!stat.isFile) {
    throw new CompilerError(
      "FROZEN_ASSET_MISSING",
      "frozen asset path is not a regular file",
      { outDir, publicPath, file: filePath },
    );
  }
  const cap = maxBufferBytes ?? FROZEN_ASSET_MAX_BUFFER_BYTES;
  if (stat.size > cap) {
    throw new CompilerError(
      "FROZEN_ASSET_TOO_LARGE",
      `frozen asset ${publicPath} is larger than the per-asset buffer cap (${stat.size} > ${cap})`,
      { outDir, publicPath, file: filePath, size: stat.size, max: cap },
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

/**
 * Convenience wrapper: load the frozen index, then call
 * `readFrozenAsset` with the result.
 *
 * Use this when you have an `outDir` and a one-shot read (for
 * example, a CLI tool or a test). The serve layer should
 * build the index once and pass it directly to
 * `readFrozenAsset`.
 */
export async function readFrozenAssetFromOutDir(
  outDir: string,
  publicPath: string,
  maxBufferBytes?: number,
): Promise<ReadFrozenAssetResult> {
  const index = await loadFrozenIndex(outDir);
  return await readFrozenAsset(index, publicPath, maxBufferBytes);
}
