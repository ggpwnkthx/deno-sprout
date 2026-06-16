/** Value for the `X-Content-Type-Options` response header. */
export const NOSNIFF = "nosniff" as const;
//
// `acceptsGzip` is a pure, environment-safe helper that returns
// whether the caller will accept a `gzip`-encoded response body.
// It is the building block for the M7 production serve's
// content-encoding negotiation; keeping it small and pure means
// the serve layer can decide "raw vs gzip" in O(entries) time
// without depending on the framework's filesystem or HTTP plumbing.
//
// The function is intentionally not a `Set` membership check: the
// RFC 7231 §5.3.4 `q` parameter lets a client refuse a coding
// (`gzip;q=0`) or ask for it with a non-default quality. The
// implementation collapses the question to a binary yes/no: a
// `gzip` (or `*`) entry is treated as "accepted" only when the
// q-value is the default (`1`, or no `q=` parameter). A sub-1
// q-value for `gzip` means the client prefers another coding
// (typically `identity`); the server returns raw bytes.

/**
 * Parse an `Accept-Encoding` header and return whether the caller
 * accepts a `gzip`-encoded body.
 *
 * Rules (per RFC 7231 §5.3.4):
 *
 *  - `null` / empty / whitespace-only → `false` (no header).
 *  - `gzip` is present without `q=0` → `true`.
 *  - `gzip;q=0` is present → `false` (caller explicitly refused).
 *  - `*` (without `gzip;q=0`) → `true`.
 *  - `identity;q=1, gzip;q=0.5` is treated as `false`: the helper
 *    only returns `true` when the gzip entry is offered with the
 *    default quality (1, or no `q=` parameter). A sub-1 q-value for
 *    `gzip` means the client prefers another coding (typically
 *    `identity`); the server returns the raw bytes.
 *  - Unknown codings (`br`, `deflate`, ...) are ignored.
 *  - The token comparison is case-insensitive (`GZIP` and `Gzip`
 *    both match).
 *  - Whitespace around tokens and `;q=` is allowed
 *    (`gzip; q=0` is a valid encoding).
 *
 * The function is pure: it does not read the filesystem, it does
 * not call Deno APIs, and it does not mutate any input. It accepts
 * the raw header value (or `null`/`undefined`) and returns a
 * boolean.
 *
 * @example
 * ```ts
 * acceptsGzip(null);                 // false
 * acceptsGzip("");                   // false
 * acceptsGzip("gzip");               // true
 * acceptsGzip("gzip;q=0");           // false
 * acceptsGzip("*");                  // true
 * acceptsGzip("deflate, gzip");      // true
 * acceptsGzip("identity");           // false
 * acceptsGzip("GZIP");               // true (case-insensitive)
 * acceptsGzip("gzip; q=0");          // false (whitespace tolerant)
 * ```
 */
export function acceptsGzip(header: string | null | undefined): boolean {
  if (header === null || header === undefined) {
    return false;
  }
  if (typeof header !== "string") {
    return false;
  }
  // Fast path: an empty or whitespace-only header is not a valid
  // `Accept-Encoding` value, but be lenient.
  const trimmed = header.trim();
  if (trimmed.length === 0) {
    return false;
  }
  const entries = trimmed.split(",");
  for (const raw of entries) {
    const entry = raw.trim();
    if (entry.length === 0) {
      continue;
    }
    // Split off the `;q=<float>` parameter(s). We only consume the
    // first q-value, which is the documented shape.
    const semi = entry.indexOf(";");
    let coding: string;
    let q = 1;
    if (semi === -1) {
      coding = entry;
    } else {
      coding = entry.slice(0, semi).trim();
      const params = entry.slice(semi + 1);
      // Walk the parameter segments and find the first `q=` value.
      for (const partRaw of params.split(";")) {
        const part = partRaw.trim();
        if (part.length === 0) {
          continue;
        }
        const eq = part.indexOf("=");
        if (eq === -1) {
          continue;
        }
        const name = part.slice(0, eq).trim().toLowerCase();
        if (name !== "q") {
          continue;
        }
        const rawQ = part.slice(eq + 1).trim();
        const parsedQ = Number(rawQ);
        if (Number.isFinite(parsedQ)) {
          q = parsedQ;
        }
        break;
      }
    }
    const token = coding.toLowerCase();
    if (token === "gzip" || token === "*") {
      // Binary yes/no: accept only the default q-value (1, or
      // absent). `gzip;q=0.5` and `*;q=0.5` are treated as "not
      // really accepted" so the server returns raw bytes.
      return q >= 1;
    }
  }
  return false;
}
