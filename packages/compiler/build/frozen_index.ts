// Frozen manifest loader for the M7 production serve.
//
// `loadFrozenIndex` reads `<outDir>/sprout.manifest.json` once at
// startup, validates the `version` field, validates every entry's
// shape, and returns an O(1) `publicPath → FrozenAsset` map. The
// index holds metadata only — asset bytes are loaded lazily by
// `readFrozenAsset` (see `./frozen_reader.ts`) and may be cached by
// the serve layer.
//
// The function deliberately does NOT touch the `_sprout/`
// directory: a frozen manifest that references a missing on-disk
// file is reported as `FROZEN_MANIFEST_UNSUPPORTED` by
// `readFrozenAsset`, not here. The loader is the "is the manifest
// honest?" gate; the reader is the "is the on-disk file honest?"
// gate.
import { join } from "@std/path";
import { CompilerError } from "../errors.ts";
import type { FrozenAsset, FrozenAssetKind, FrozenIndex } from "../manifest/types.ts";

/** The set of valid `kind` values per the M6 writer. */
const VALID_KINDS: ReadonlySet<FrozenAssetKind> = new Set([
  "runtime",
  "island",
  "style",
  "vendor",
]);

/** A 16-character lowercase-hex content hash. */
const HASH_RE = /^[0-9a-f]{16}$/;

/** The `/@sprout/...` framework namespace prefix. */
const RESERVED_PUBLIC_PREFIX = "/@sprout/";

/** A public path under `_sprout/` for the manifest's `file` field. */
const RELATIVE_FILE_RE = /^_sprout\//;

/**
 * Load the frozen manifest from `outDir` and return an O(1)
 * `publicPath → FrozenAsset` index.
 *
 * The function:
 *
 *   1. `Deno.stat`s `<outDir>/sprout.manifest.json`. A missing
 *      file throws `FROZEN_MANIFEST_MISSING` with `{ outDir }` in
 *      `details` — the production-serve startup error path
 *      translates this into "run `sprout build` first".
 *   2. Reads the file as text and `JSON.parse`s it. A `SyntaxError`
 *      throws `FROZEN_MANIFEST_UNSUPPORTED` with the parse error
 *      message in `details.cause`.
 *   3. Validates the top-level shape: `version: 1` and `assets` is
 *      a plain array. Anything else throws
 *      `FROZEN_MANIFEST_UNSUPPORTED`.
 *   4. Validates each entry. A malformed entry throws
 *      `FROZEN_MANIFEST_UNSUPPORTED` with the offending `id` and
 *      `publicPath` in `details`.
 *   5. Builds the `Map<publicPath, FrozenAsset>`. A duplicate
 *      `publicPath` throws `FROZEN_MANIFEST_UNSUPPORTED`.
 *   6. Returns `{ version: 1, assets: map, outDir }`.
 *
 * The function never reads the `_sprout/` directory. The
 * `readFrozenAsset` helper is responsible for byte I/O.
 */
export async function loadFrozenIndex(outDir: string): Promise<FrozenIndex> {
  if (typeof outDir !== "string" || outDir.length === 0) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "outDir must be a non-empty string",
      { outDir },
    );
  }
  const manifestPath = join(outDir, "sprout.manifest.json");

  // Step 1: stat the manifest. A missing file is the common
  // case (user ran `sprout serve` without `sprout build`) and
  // gets its own error code so the CLI can print a targeted
  // "run sprout build first" hint.
  let manifestStat: Deno.FileInfo;
  try {
    manifestStat = await Deno.stat(manifestPath);
  } catch (_cause) {
    throw new CompilerError(
      "FROZEN_MANIFEST_MISSING",
      `frozen manifest not found at ${manifestPath}; run \`sprout build\` first`,
      { outDir, manifestPath },
    );
  }
  if (!manifestStat.isFile) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest path is not a regular file: ${manifestPath}`,
      { outDir, manifestPath },
    );
  }

  // Step 2: read + parse.
  let raw: string;
  try {
    raw = await Deno.readTextFile(manifestPath);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `failed to read frozen manifest at ${manifestPath}`,
      { outDir, cause: message },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "frozen manifest is not valid JSON",
      { outDir, cause: message },
    );
  }

  // Step 3: top-level shape.
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "frozen manifest has an unexpected shape: top-level value must be a plain object",
      { outDir },
    );
  }
  const obj = parsed as Record<string, unknown>;
  if (obj.version !== 1) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest has an unexpected shape: version must be 1, got ${String(obj.version)}`,
      { outDir, version: obj.version },
    );
  }
  if (!Array.isArray(obj.assets)) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      "frozen manifest has an unexpected shape: assets must be an array",
      { outDir },
    );
  }

  // Step 4 + 5: validate each entry and build the map.
  const assets = new Map<string, FrozenAsset>();
  for (let i = 0; i < obj.assets.length; i++) {
    const entry = obj.assets[i];
    const validated = validateAssetEntry(entry, outDir, i);
    if (assets.has(validated.publicPath)) {
      throw new CompilerError(
        "FROZEN_MANIFEST_UNSUPPORTED",
        "duplicate publicPath in frozen manifest",
        { outDir, publicPath: validated.publicPath },
      );
    }
    assets.set(validated.publicPath, validated);
  }

  return {
    version: 1,
    assets,
    outDir,
  };
}

/** Validate one manifest entry. Throws on the first bad field. */
function validateAssetEntry(
  entry: unknown,
  outDir: string,
  index: number,
): FrozenAsset {
  if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset at index ${index} is not a plain object`,
      { outDir, index },
    );
  }
  const e = entry as Record<string, unknown>;
  const { kind, id, publicPath, file, contentType, hash, gzipFile } = e;

  if (typeof kind !== "string" || !VALID_KINDS.has(kind as FrozenAssetKind)) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset at index ${index} has invalid kind`,
      { outDir, index, kind: String(kind) },
    );
  }
  if (typeof id !== "string" || id.length === 0) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset at index ${index} has invalid id`,
      { outDir, index, id: String(id) },
    );
  }
  if (typeof publicPath !== "string" || publicPath.length === 0) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset at index ${index} has invalid publicPath`,
      { outDir, index, id, publicPath: String(publicPath) },
    );
  }
  if (!publicPath.startsWith(RESERVED_PUBLIC_PREFIX)) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset ${id} publicPath must live under ${RESERVED_PUBLIC_PREFIX}`,
      { outDir, id, publicPath },
    );
  }
  if (publicPath.includes("\0") || publicPath.includes("..")) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset ${id} publicPath contains forbidden characters`,
      { outDir, id, publicPath },
    );
  }
  if (typeof file !== "string" || file.length === 0) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset ${id} has invalid file`,
      { outDir, id, file: String(file) },
    );
  }
  if (!RELATIVE_FILE_RE.test(file)) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset ${id} file must be a slash-normalized relative path under _sprout/`,
      { outDir, id, file },
    );
  }
  if (file.includes("\0") || file.includes("..")) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset ${id} file contains forbidden characters`,
      { outDir, id, file },
    );
  }
  if (typeof contentType !== "string" || contentType.length === 0) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset ${id} has invalid contentType`,
      { outDir, id, contentType: String(contentType) },
    );
  }
  if (typeof hash !== "string" || !HASH_RE.test(hash)) {
    throw new CompilerError(
      "FROZEN_MANIFEST_UNSUPPORTED",
      `frozen manifest asset ${id} has invalid hash (expected 16 lowercase hex chars)`,
      { outDir, id, hash: String(hash) },
    );
  }
  if (gzipFile !== undefined) {
    if (typeof gzipFile !== "string" || !RELATIVE_FILE_RE.test(gzipFile)) {
      throw new CompilerError(
        "FROZEN_MANIFEST_UNSUPPORTED",
        `frozen manifest asset ${id} gzipFile must be a slash-normalized relative path under _sprout/`,
        { outDir, id, gzipFile: String(gzipFile) },
      );
    }
    if (gzipFile.includes("\0") || gzipFile.includes("..")) {
      throw new CompilerError(
        "FROZEN_MANIFEST_UNSUPPORTED",
        `frozen manifest asset ${id} gzipFile contains forbidden characters`,
        { outDir, id, gzipFile },
      );
    }
  }

  const base: FrozenAsset = {
    kind: kind as FrozenAssetKind,
    id,
    publicPath,
    file,
    contentType,
    hash,
  };
  if (typeof gzipFile === "string") {
    return { ...base, gzipFile };
  }
  return base;
}
