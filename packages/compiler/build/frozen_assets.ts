// OutDir safety, content-type lookup, and content-hashed asset writing
// for the M6 production build.
//
// Three concerns live here:
//
//   1. `ensureSafeOutDir` classifies the target outDir as one of
//      "missing" / "empty" / "prior-manifest" / "unsafe" per
//      `docs/sprout/security-and-validation.md` § OutDir. The build
//      uses the result to decide whether to create the directory,
//      proceed, or refuse with `BUILD_OUTDIR_UNSAFE`.
//
//   2. `contentTypeFor` maps an on-disk filename to a content type.
//      The map is small and matches the dev asset shape: JS / MJS →
//      `text/javascript; charset=utf-8`, CSS → `text/css; charset=utf-8`,
//      MAP → `application/json; charset=utf-8`, default →
//      `application/octet-stream`.
//
//   3. `writeHashedAsset` writes a single content-hashed file under
//      `<outDir>/_sprout/`, optionally writes a `.gz` companion,
//      and returns a typed `FrozenAsset`.
//
// These helpers are package-internal; `build/mod.ts` re-exports the
// public-facing production build surface only.
import { encodeHex } from "@std/encoding/hex";
import { fromFileUrl, join } from "@std/path";
import { CompilerError } from "../errors.ts";
import type { FrozenAsset, FrozenAssetKind } from "../manifest/types.ts";
import { maybeGzip } from "./gzip.ts";

/**
 * The four outDir safety classes. The build uses these to drive
 * the create / proceed / empty / refuse decision.
 */
export type OutDirSafety = "missing" | "empty" | "prior-manifest" | "unsafe";

/**
 * Classify the target `outDir` per the rules in
 * `docs/sprout/security-and-validation.md` § OutDir.
 *
 * Returns:
 *   - `"missing"`        — the directory does not exist. The caller
 *                          should create it.
 *   - `"empty"`          — the directory exists and contains no
 *                          entries. The caller may proceed.
 *   - `"prior-manifest"` — the directory exists and contains exactly
 *                          `sprout.manifest.json` and nothing else
 *                          (no `_sprout/` subdirectory, no other
 *                          files). The caller should empty the
 *                          directory before writing fresh assets.
 *   - `"unsafe"`         — the directory exists with anything else.
 *                          The caller should refuse with
 *                          `BUILD_OUTDIR_UNSAFE`.
 *
 * The function is intentionally read-only. It never modifies the
 * filesystem; the caller is responsible for the actual mkdir /
 * rmdir.
 */
export async function ensureSafeOutDir(outDir: string): Promise<OutDirSafety> {
  let stat: Deno.FileInfo;
  try {
    stat = await Deno.stat(outDir);
  } catch (_cause) {
    return "missing";
  }
  if (!stat.isDirectory) {
    // Treat a non-directory at the outDir path as unsafe: the spec
    // requires an empty directory or a prior manifest, neither of
    // which a regular file satisfies.
    return "unsafe";
  }
  const entries: string[] = [];
  for await (const entry of Deno.readDir(outDir)) {
    entries.push(entry.name);
  }
  if (entries.length === 0) {
    return "empty";
  }
  if (entries.length === 1 && entries[0] === "sprout.manifest.json") {
    return "prior-manifest";
  }
  return "unsafe";
}

/**
 * Recursively remove every entry in `outDir` except
 * `sprout.manifest.json`. Used after a `"prior-manifest"`
 * classification so a fresh build starts from a clean directory but
 * the prior manifest (which the next call will overwrite) does not
 * have to be recreated.
 */
export async function emptyOutDir(outDir: string): Promise<void> {
  for await (const entry of Deno.readDir(outDir)) {
    if (entry.name === "sprout.manifest.json") {
      continue;
    }
    const child = join(outDir, entry.name);
    await Deno.remove(child, { recursive: true });
  }
}

/** Content-type map. Mirrors the dev asset shape. */
const CONTENT_TYPES: Readonly<Record<string, string>> = {
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

const DEFAULT_CONTENT_TYPE = "application/octet-stream";

/**
 * Map a filename to a content type. JS / MJS, CSS, and `.map` have
 * explicit entries; anything else returns `application/octet-stream`.
 *
 * The lookup is a `Map<string, string>` keyed on the lowercase
 * extension (including the leading dot). It is exposed (rather than
 * inlined) so tests can assert the map shape.
 */
export function contentTypeFor(filename: string): string {
  const slashIdx = Math.max(filename.lastIndexOf("/"), filename.lastIndexOf("\\"));
  const basename = slashIdx >= 0 ? filename.slice(slashIdx + 1) : filename;
  const dotIdx = basename.lastIndexOf(".");
  if (dotIdx <= 0) {
    return DEFAULT_CONTENT_TYPE;
  }
  const ext = basename.slice(dotIdx).toLowerCase();
  return CONTENT_TYPES[ext] ?? DEFAULT_CONTENT_TYPE;
}

/** The on-disk filename for a hashed asset, no leading directory. */
function hashedFileName(kind: FrozenAssetKind, id: string, hash: string): string {
  switch (kind) {
    case "runtime":
      return `runtime.${hash}.js`;
    case "island":
      // Replace path separators in the island id with a single
      // dash so the on-disk filename stays flat. `cart/AddButton`
      // becomes `island-cart-AddButton.<hash>.js`.
      return `island-${id.replace(/\//g, "-")}.${hash}.js`;
    case "style":
      return `style-${id}.${hash}.css`;
    case "vendor":
      return `vendor.${hash}.js`;
  }
}

/** The on-disk filename for the gzip companion of a hashed asset. */
function gzipCompanionFileName(fileName: string): string {
  // `_sprout/runtime.<hash>.js`  → `_sprout/runtime.<hash>.gz.js`
  // `_sprout/island-X.<hash>.js` → `_sprout/island-X.<hash>.gz.js`
  // `_sprout/style-app.<hash>.css` → `_sprout/style-app.<hash>.gz.css`
  // `_sprout/vendor.<hash>.js`    → `_sprout/vendor.<hash>.gz.js`
  const dotIdx = fileName.lastIndexOf(".");
  if (dotIdx < 0) {
    return `${fileName}.gz`;
  }
  return `${fileName.slice(0, dotIdx)}.gz${fileName.slice(dotIdx)}`;
}

/** Compute the 16-character lowercase-hex content hash of `bytes`. */
async function sha16(bytes: Uint8Array): Promise<string> {
  // The crypto.subtle.digest overloads want a `BufferSource` that
  // is a `Uint8Array<ArrayBuffer>`. A function-parameter `Uint8Array`
  // is `Uint8Array<ArrayBufferLike>`, which the strict type rejects
  // because the buffer could be a `SharedArrayBuffer`. Make a fresh
  // copy backed by an `ArrayBuffer` to satisfy the overload.
  const data = new Uint8Array(bytes);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return encodeHex(new Uint8Array(digest)).slice(0, 16);
}

/** Inputs accepted by {@link writeHashedAsset}. */
export type WriteHashedAssetOptions = {
  readonly outDir: string;
  readonly kind: FrozenAssetKind;
  readonly id: string;
  readonly publicPath: string;
  readonly contentType: string;
  readonly bytes: Uint8Array;
  readonly compress: false | "gzip";
};

/**
 * Write a single content-hashed asset under `<outDir>/_sprout/`,
 * optionally writing a `.gz` companion, and return the typed
 * `FrozenAsset` entry. The `publicPath` on the returned entry is
 * the caller-supplied canonical URL; the `file` is the relative
 * `_sprout/<fileName>` path the manifest exposes to the runtime.
 */
export async function writeHashedAsset(
  opts: WriteHashedAssetOptions,
): Promise<FrozenAsset> {
  const hash = await sha16(opts.bytes);
  const fileName = hashedFileName(opts.kind, opts.id, hash);
  const sproutDir = join(opts.outDir, "_sprout");
  await Deno.mkdir(sproutDir, { recursive: true });
  const absFile = join(sproutDir, fileName);
  await Deno.writeFile(absFile, opts.bytes);

  let gzipFile: string | undefined;
  if (opts.compress === "gzip") {
    const gzBytes = await maybeGzip(opts.bytes, "gzip");
    if (gzBytes !== null) {
      const gzName = gzipCompanionFileName(fileName);
      await Deno.writeFile(join(sproutDir, gzName), gzBytes);
      gzipFile = `_sprout/${gzName}`;
    }
  }

  const base: FrozenAsset = {
    kind: opts.kind,
    id: opts.id,
    publicPath: opts.publicPath,
    file: `_sprout/${fileName}`,
    contentType: opts.contentType,
    hash,
  };
  if (gzipFile !== undefined) {
    return { ...base, gzipFile };
  }
  return base;
}

/** Re-export `fromFileUrl` so callers can avoid the double import. */
export { fromFileUrl };

/**
 * Throw `BUILD_OUTDIR_UNSAFE` with the offending entries in
 * `details.entries`. Package-internal helper used by
 * `buildProduction` after a `"unsafe"` classification.
 */
export function unsafeOutDirError(
  outDir: string,
  entries: readonly string[],
): never {
  throw new CompilerError(
    "BUILD_OUTDIR_UNSAFE",
    `outDir ${outDir} is not safe to empty; remove the foreign entries and retry`,
    { outDir, entries: [...entries] },
  );
}
