// Route file discovery.
//
// Walks the configured routes directory, applies include / exclude
// globs, maps each surviving file to a `DiscoveredRoute`, and
// rejects duplicate route patterns with a typed `DISCOVERY_ROUTE_CONFLICT`
// error.
//
// The "kind" classification is a static-analysis approximation: a
// file is `page` if it contains `export default`, `endpoint` if it
// contains at least one method export (`GET`/`POST`/...), and `mixed`
// if it has both. A file with neither falls back to `page` so that
// the manifest validator does not reject a path that is otherwise
// well-formed; the M3 server renderer will tighten this up.
import { relative } from "@std/path";
import { slash, SUPPORTED_HTTP_METHODS } from "@sprout/utils";
import type { HttpMethod } from "@sprout/utils";
import type { ResolvedConfig } from "@sprout/config";
import { CompilerError } from "../errors.ts";
import { routeFileToPattern } from "../manifest/paths.ts";
import { stripExtension, walkForDiscovery } from "./glob.ts";
import type { DiscoveredRoute } from "../manifest/types.ts";

const HTTP_METHODS = new Set(SUPPORTED_HTTP_METHODS);

/**
 * Discover all route files in the project.
 *
 * The returned list is sorted by `pattern` for determinism. Duplicate
 * `pattern` values produce a typed `DISCOVERY_ROUTE_CONFLICT` error
 * with the conflicting files in `details.files`.
 */
export async function discoverRoutes(
  config: ResolvedConfig,
): Promise<readonly DiscoveredRoute[]> {
  const files = await walkForDiscovery(
    config.routes.dir,
    config.routes.include,
    config.routes.exclude,
  );

  const out: DiscoveredRoute[] = [];
  for (const file of files) {
    const relRaw = relative(config.routes.dir, file);
    const rel = slash(relRaw);
    if (!rel.endsWith(".ts") && !rel.endsWith(".tsx")) {
      throw new CompilerError(
        "DISCOVERY_INVALID_ROUTE_FILE",
        `route file must end in .ts or .tsx`,
        { file, ext: rel.slice(rel.lastIndexOf(".")) },
      );
    }
    const relNoExt = stripExtension(rel);
    const pattern = routeFileToPattern(relNoExt);
    if (pattern === null) {
      // The file maps to no URL — most often a private helper
      // (leading underscore) or a route group whose segments were
      // stripped leaving an empty path that has been caught earlier.
      // Skip silently: the include / exclude globs should have kept
      // these out, and returning `null` is the documented skip
      // signal.
      continue;
    }
    const kind = await classifyRouteFile(file);
    out.push({
      id: relNoExt,
      pattern,
      file,
      kind,
    });
  }

  // Detect duplicate patterns. The first occurrence of a pattern
  // wins; the second throws with both files in `details.files`.
  const seen = new Map<string, DiscoveredRoute>();
  for (const route of out) {
    const previous = seen.get(route.pattern);
    if (previous !== undefined) {
      throw new CompilerError(
        "DISCOVERY_ROUTE_CONFLICT",
        `route pattern ${JSON.stringify(route.pattern)} is mapped by two files`,
        { pattern: route.pattern, files: [previous.file, route.file] },
      );
    }
    seen.set(route.pattern, route);
  }

  return out.slice().sort((a, b) => (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0));
}

/**
 * Classify a route file by static analysis: read the source text and
 * look for `export default` (page indicator) and method exports
 * (`GET`, `POST`, etc., endpoint indicators). `mixed` covers both.
 *
 * M3 will tighten this with proper module resolution; for M2 a
 * heuristic is acceptable because route files that are ambiguous
 * typically resolve at render time anyway.
 */
async function classifyRouteFile(file: string): Promise<"page" | "endpoint" | "mixed"> {
  let text = "";
  try {
    text = await Deno.readTextFile(file);
  } catch (_cause) {
    return "page";
  }
  const hasDefault = /(^|\n)\s*export\s+default\b/.test(text);
  const hasMethod = hasMethodExport(text);
  if (hasDefault && hasMethod) {
    return "mixed";
  }
  if (hasMethod) {
    return "endpoint";
  }
  return "page";
}

/** `true` if the file source mentions at least one of the supported method exports. */
function hasMethodExport(text: string): boolean {
  // Match `export function NAME` or `export async function NAME` where
  // NAME is an HTTP method. We deliberately match the declaration,
  // not the import or the re-export, to keep this heuristic simple.
  const re = /(^|\n)\s*export\s+(?:async\s+)?function\s+([A-Z][A-Z0-9_]*)\b/g;
  for (let m = re.exec(text); m !== null; m = re.exec(text)) {
    const name = m[2];
    if (name !== undefined && HTTP_METHODS.has(name as HttpMethod)) {
      return true;
    }
  }
  return false;
}
