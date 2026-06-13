// Discovery-only helper: walk a directory and yield file paths that
// match include / exclude globs.
//
// The implementation uses `@std/fs/walk` for the directory recursion
// and a hand-rolled glob matcher in `manifest/paths.ts` for the
// filter. This keeps M2 free of `npm:` glob libraries while still
// supporting the include / exclude patterns documented in
// `docs/sprout/packages/config.md`.
import { walk } from "@std/fs";
import type { WalkEntry } from "@std/fs";
import { isInsideRoot, slash } from "@sprout/utils";
import { matchesDiscoveryGlobs } from "../manifest/paths.ts";

/**
 * Result of a discovery walk: a list of absolute file paths that
 * matched the include / exclude globs.
 */
export async function walkForDiscovery(
  rootDir: string,
  include: readonly string[],
  exclude: readonly string[],
): Promise<readonly string[]> {
  const root = slash(rootDir);
  if (root.length === 0) {
    return [];
  }
  // `walk` throws when the root does not exist. The discovery contract
  // treats a missing discovery directory as "no files" so users who
  // have not yet created `src/routes/` or `src/islands/` do not see a
  // hard failure.
  let existed = false;
  try {
    const stat = Deno.statSync(root);
    existed = stat.isDirectory;
  } catch (_cause) {
    existed = false;
  }
  if (!existed) {
    return [];
  }

  const out: string[] = [];
  for await (const entry of walk(root, { includeFiles: true, includeDirs: false })) {
    if (entry.isFile) {
      out.push(entry.path);
    }
  }
  return out.filter((abs) => {
    if (!isInsideRoot(abs, root)) {
      return false;
    }
    const rel = abs.slice(root.length);
    // `walk` yields the root path itself first; in that case `rel` is
    // empty. We never want to treat the directory as a route or
    // island, so an empty relative path is always rejected.
    if (rel.length === 0) {
      return false;
    }
    const normalized = rel.startsWith("/") ? rel.slice(1) : rel;
    return matchesDiscoveryGlobs(normalized, include, exclude);
  });
}

/** Strip the file extension from a path (last `.ts` / `.tsx` / `.js` / `.jsx`). */
export function stripExtension(path: string): string {
  const i = path.lastIndexOf(".");
  if (i < 0) {
    return path;
  }
  return path.slice(0, i);
}

/** The single WalkEntry return type for explicit type-only callers. */
export type { WalkEntry };
