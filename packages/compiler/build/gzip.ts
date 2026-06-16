// Thin gzip wrapper used by the M6 production build.
//
// `gzipBytes` is a small wrapper around the Web-standard
// `CompressionStream("gzip")`. The resulting bytes are RFC 1952
// gzip-framed, which is what `Content-Encoding: gzip` consumers
// expect. Deno's `CompressionStream` ships with the runtime, so this
// is a JSR-only / Node-free path.
//
// `maybeGzip` is the helper the asset writer uses: it returns the
// gzipped bytes when the configured `compress` mode is `"gzip"`, and
// `null` otherwise. The `null` lets the caller skip writing a `.gz`
// companion without an extra branch.
//
// Permissions: none. `CompressionStream` runs in the runtime without
// file I/O or network access.

/**
 * Compress `input` with the Web `CompressionStream("gzip")` and
 * return the resulting bytes. The output is RFC 1952 gzip-framed
 * (i.e. suitable for `Content-Encoding: gzip`).
 *
 * The input is wrapped in a `Blob` so it can be turned into a
 * `ReadableStream`; the stream is piped through the compression
 * transform; the output is collected as a single `Uint8Array`.
 */
export async function gzipBytes(input: Uint8Array): Promise<Uint8Array> {
  // A `Blob` is the simplest way to turn a `Uint8Array` into a
  // `ReadableStream` that `CompressionStream` accepts. The `BlobPart`
  // type accepts `Uint8Array` directly in modern lib.dom.
  const blob = new Blob([input as BlobPart]);
  const compressed = blob.stream().pipeThrough(new CompressionStream("gzip"));
  const buffer = await new Response(compressed).arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Return gzipped bytes when `compress === "gzip"`, otherwise `null`.
 * Returns `null` when compression did not shrink the input (gzip
 * output is `>=` the raw byte length). This prevents writing a
 * `.gz` companion that would be larger than the original and is the
 * right behavior for already-compressed or trivially-compressible
 * inputs (empty files, tiny boot stubs, PNG bytes, etc.). The asset
 * writer calls this once per asset to decide whether to write a
 * `.gz.js` / `.gz.css` companion.
 */
export async function maybeGzip(
  input: Uint8Array,
  compress: false | "gzip",
): Promise<Uint8Array | null> {
  if (compress !== "gzip") {
    return null;
  }
  const gz = await gzipBytes(input);
  if (gz.length >= input.length) {
    return null;
  }
  return gz;
}
