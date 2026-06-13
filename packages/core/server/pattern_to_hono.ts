// Translate a manifest `RoutePattern` to a Hono route pattern.
//
// Manifest patterns may carry an optional regex constraint
// (`/files/:path{.+}` for catch-alls, `/items/:id{[0-9]+}` for
// numeric ids, etc.). Hono's `RegExpRouter` does support
// `:name{regex}` constraints in its trie, but the manifest format
// was designed to be transportable across routers. The M3 server
// strips the constraint to keep the wire format portable and to
// avoid subtle differences between Hono's two routers
// (`RegExpRouter` and `TrieRouter`).
//
// The trade-off: catch-all patterns (`/files/:path{.+}`) become
// `/files/:path`, which matches a single path segment rather than
// many. M3 tests do not exercise the catch-all match; the M7
// production serve will revisit the translation strategy.
//
// Examples:
//
//   `patternToHono("/")`         → `"/"`
//   `patternToHono("/about")`    → `"/about"`
//   `patternToHono("/blog/:slug")` → `"/blog/:slug"`
//   `patternToHono("/files/:path{.+}")` → `"/files/:path"`
//   `patternToHono("/items/:id{[0-9]+}")` → `"/items/:id"`

/**
 * Match `:name{...}` as a single token, allowing any non-`}`
 * character inside the constraint (so regex bodies that contain
 * `/`, `+`, `(`, `)`, etc. are not split on `/` by the segment
 * walker).
 */
const CONSTRAINT_RE = /^:([A-Za-z_][A-Za-z0-9_]*)\{[^}]*\}/;

/**
 * Map a manifest pattern to a Hono-compatible pattern. The
 * function is intentionally pure (string-in, string-out) so tests
 * can lock its behavior down.
 */
export function patternToHono(pattern: string): string {
  if (typeof pattern !== "string" || pattern.length === 0) {
    return pattern;
  }
  // Walk left-to-right and split into segments. A segment starts
  // after a `/` that is NOT inside a `{...}` constraint. We process
  // one segment at a time using a state machine.
  const out: string[] = [];
  let buf = "";
  let depth = 0;
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i];
    if (ch === "{") {
      depth++;
      buf += ch;
    } else if (ch === "}") {
      depth--;
      buf += ch;
    } else if (ch === "/" && depth === 0) {
      out.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  out.push(buf);

  // Strip the constraint from each segment.
  const mapped: string[] = [];
  for (const seg of out) {
    const m = CONSTRAINT_RE.exec(seg);
    if (m !== null) {
      mapped.push(":" + m[1]);
    } else {
      mapped.push(seg);
    }
  }
  return mapped.join("/");
}
