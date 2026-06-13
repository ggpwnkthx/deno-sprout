// M7 production-serve asset routes.
//
// `serveFrozenAsset` is the request-time helper that turns a
// `FrozenAsset` entry into a `Response` with the M7 cache
// contract:
//
//   - `cache-control: public, max-age=31536000, immutable`
//     (content-hashed filenames never need revalidation beyond
//     the immutable bit).
//   - `etag: "<hash>"` (strong ETag per RFC 7232).
//   - `vary: accept-encoding` (the response body changes shape
//     based on `Accept-Encoding`).
//   - `If-None-Match` matching the ETag returns a 304 with the
//     same cache headers and an empty body.
//   - Gzip bytes are served only when the client accepts gzip
//     AND the manifest has a gzip companion. A missing companion
//     degrades to raw bytes; the caller's `readFrozenAsset` does
//     the disk read and reports `gzipBytes: null` in that case.
//
// The function is pure: it does not read the filesystem, it does
// not cache results. The serve layer (`server/app.ts`) owns the
// LRU and the index lifetime; this helper is the per-request
// `ETag` / `Accept-Encoding` / 304 decision.
import { acceptsGzip } from "@sprout/utils";
import { readFrozenAsset } from "@sprout/compiler";
import type { FrozenIndex, ReadFrozenAssetResult } from "@sprout/compiler";
import { CoreError, coreErrorToResponse } from "./errors.ts";

/** The cache header attached to every framework asset response. */
const CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Options accepted by {@link serveFrozenAsset}. */
export type ServeFrozenAssetOptions = {
  /** The M7 in-memory index built once at startup. */
  readonly frozenIndex: FrozenIndex;
  /** The canonical public path the request is for. */
  readonly publicPath: string;
  /** The inbound request (used for `If-None-Match` and `Accept-Encoding`). */
  readonly request: Request;
  /**
   * Optional pre-read bytes. The serve layer can pass this when
   * the asset is in the bounded LRU; the helper skips
   * `readFrozenAsset` and uses these bytes directly. When
   * omitted, the helper performs the disk read.
   */
  readonly preloaded?: ReadFrozenAssetResult;
};

/**
 * The result of an asset lookup. Used by the serve layer to
 * decide which bytes to return. The shape mirrors the spec:
 *
 *   - `asset` is the typed `FrozenAsset` entry; its `hash`
 *     becomes the strong `ETag`.
 *   - `bytes` is the raw asset body.
 *   - `gzipBytes` is the optional `.gz` companion body (may be
 *     `null` when the manifest has no companion).
 *
 * The serve layer is expected to look this up through its LRU
 * before calling {@link serveFrozenAsset}. The helper is the
 * shape decision, not the I/O decision.
 */
export type FrozenAssetLookup = {
  readonly asset: import("@sprout/compiler").FrozenAsset;
  readonly bytes: Uint8Array;
  readonly gzipBytes: Uint8Array | null;
};

/**
 * Serve a frozen asset. Returns a 404 `Response` (via the typed
 * `coreErrorToResponse` path) when `publicPath` is not in the
 * index.
 *
 * The function reads the asset bytes via `readFrozenAsset` on
 * every call. The serve layer is expected to cache the result
 * keyed on `publicPath` so the disk I/O happens at most once per
 * cached entry. The cache itself lives outside this helper.
 */
export async function serveFrozenAsset(
  opts: ServeFrozenAssetOptions,
): Promise<Response> {
  const asset = opts.frozenIndex.assets.get(opts.publicPath);
  if (asset === undefined) {
    return coreErrorToResponse(
      new CoreError(
        "STATIC_FILE_NOT_FOUND",
        `no frozen asset for ${opts.publicPath}`,
        { publicPath: opts.publicPath },
      ),
    );
  }
  // Lazy byte read. The serve layer's LRU is the only thing that
  // keeps this from happening on every request; this helper does
  // not cache. A pre-loaded result (from the LRU) bypasses the
  // disk read.
  const result = opts.preloaded ??
    await readFrozenAsset(opts.frozenIndex.outDir, opts.publicPath);

  const etag = `"${asset.hash}"`;
  // 304 path: a matching `If-None-Match` short-circuits to an
  // empty-body response that still carries the cache headers.
  if (etagMatches(opts.request.headers.get("if-none-match"), etag)) {
    const headers = new Headers({
      "etag": etag,
      "cache-control": CACHE_CONTROL,
      "vary": "accept-encoding",
    });
    return new Response(null, { status: 304, headers });
  }

  // Gzip negotiation. A missing companion (result.gzipBytes ===
  // null) means the manifest recorded no `gzipFile`; we fall
  // back to raw bytes without warning at this layer.
  const acceptGzip = acceptsGzip(opts.request.headers.get("accept-encoding"));
  const sendGzip = acceptGzip && result.gzipBytes !== null;
  // The `Response` body wants an `ArrayBuffer` (not the wider
  // `ArrayBufferLike` a typed `Uint8Array` carries). Copy through
  // `slice().buffer` to satisfy the strict type without changing
  // the bytes.
  const source = sendGzip ? result.gzipBytes : result.bytes;
  const body: ArrayBuffer = source.slice().buffer;

  const headers = new Headers({
    "content-type": result.contentType,
    "etag": etag,
    "cache-control": CACHE_CONTROL,
    "vary": "accept-encoding",
  });
  if (sendGzip) {
    headers.set("content-encoding", "gzip");
  }
  return new Response(body, { status: 200, headers });
}

/**
 * Test whether an `If-None-Match` header value matches the
 * given ETag. The header is a comma-separated list of quoted
 * ETags; `*` matches any strong ETag. `W/` (weak) prefix is
 * stripped before comparison.
 *
 * Returns `false` when the header is `null`, empty, or contains
 * no matching entry. Whitespace around the entries is ignored.
 */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (ifNoneMatch === null) return false;
  const trimmed = ifNoneMatch.trim();
  if (trimmed.length === 0) return false;
  if (trimmed === "*") return true;
  for (const raw of trimmed.split(",")) {
    const entry = raw.trim();
    if (entry.length === 0) continue;
    // Strip the `W/` weak prefix. The server's ETag is strong
    // (the manifest hash is a byte-for-byte fingerprint), so any
    // entry that is `W/<our-hash>` still matches the strong ETag.
    const candidate = entry.startsWith("W/") ? entry.slice(2) : entry;
    if (candidate === etag) return true;
  }
  return false;
}
