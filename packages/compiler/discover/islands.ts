// Island file discovery.
//
// Walks the configured islands directory, applies include / exclude
// globs, maps each surviving file to a `DiscoveredIsland`, and
// rejects duplicate public paths with a typed `DISCOVERY_ISLAND_CONFLICT`
// error.
//
// The output is sorted by `id` for determinism.
import { relative } from "@std/path";
import { slash } from "@sprout/utils";
import type { ResolvedConfig } from "@sprout/config";
import { CompilerError } from "../errors.ts";
import { islandFileToPublicPath } from "../manifest/paths.ts";
import { stripExtension, walkForDiscovery } from "./glob.ts";
import type { DiscoveredIsland } from "../manifest/types.ts";

/**
 * Discover all island files in the project.
 *
 * The returned list is sorted by `id` for determinism. Duplicate
 * `publicPath` values produce a typed `DISCOVERY_ISLAND_CONFLICT`
 * error with the conflicting files in `details.files`.
 */
export async function discoverIslands(
  config: ResolvedConfig,
): Promise<readonly DiscoveredIsland[]> {
  const files = await walkForDiscovery(
    config.islands.dir,
    config.islands.include,
    config.islands.exclude,
  );

  const out: DiscoveredIsland[] = [];
  for (const file of files) {
    const relRaw = relative(config.islands.dir, file);
    const rel = slash(relRaw);
    if (!rel.endsWith(".ts") && !rel.endsWith(".tsx")) {
      throw new CompilerError(
        "DISCOVERY_INVALID_ISLAND_FILE",
        `island file must end in .ts or .tsx`,
        { file, ext: rel.slice(rel.lastIndexOf(".")) },
      );
    }
    const id = stripExtension(rel);
    const publicPath = islandFileToPublicPath(id);
    out.push({
      id,
      file,
      exportName: "default",
      publicPath,
    });
  }

  // Detect duplicate ids and public paths.
  const seenIds = new Map<string, DiscoveredIsland>();
  const seenPublic = new Map<string, DiscoveredIsland>();
  for (const island of out) {
    const prevId = seenIds.get(island.id);
    if (prevId !== undefined) {
      throw new CompilerError(
        "MANIFEST_DUPLICATE_ID",
        `island id ${JSON.stringify(island.id)} is used by two files`,
        { id: island.id, files: [prevId.file, island.file] },
      );
    }
    seenIds.set(island.id, island);
    const prevPublic = seenPublic.get(island.publicPath);
    if (prevPublic !== undefined) {
      throw new CompilerError(
        "DISCOVERY_ISLAND_CONFLICT",
        `island public path ${JSON.stringify(island.publicPath)} is used by two files`,
        { publicPath: island.publicPath, files: [prevPublic.file, island.file] },
      );
    }
    seenPublic.set(island.publicPath, island);
  }

  return out.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}
