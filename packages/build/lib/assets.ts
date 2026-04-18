// lib/assets.ts - Island asset management
import { walk } from "@std/fs/walk";
import { basename, extname, join } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";

export interface DiscoveredIsland {
  /** Island name derived from filename. e.g. "Counter" */
  name: string;
  /** Absolute path to the source .tsx/.ts file. */
  sourcePath: string;
}

/**
 * Walk `islandsDir` and return every .tsx/.ts file as a DiscoveredIsland.
 */
export async function discoverIslands(
  islandsDir: string,
): Promise<DiscoveredIsland[]> {
  const islands: DiscoveredIsland[] = [];

  // Check if directory exists
  try {
    await Deno.stat(islandsDir);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return [];
    }
    throw err;
  }

  for await (
    const entry of walk(islandsDir, {
      includeDirs: false,
      exts: [".ts", ".tsx"],
    })
  ) {
    const name = basename(entry.path, extname(entry.path));
    islands.push({
      name,
      sourcePath: entry.path,
    });
  }

  return islands;
}

/**
 * Write a compiled island bundle to `{outdir}/islands/{name}.{hash}.js`.
 * Returns the output file path.
 */
export async function writeIslandBundle(
  name: string,
  code: string,
  hash: string,
  outdir: string,
): Promise<string> {
  const islandsDir = join(outdir, "islands");
  await ensureDir(islandsDir);
  const filename = `${name}.${hash}.js`;
  const filePath = join(islandsDir, filename);
  await Deno.writeFile(filePath, new TextEncoder().encode(code));
  return filePath;
}

/**
 * Copy all files from `staticDir` to `{outdir}/static/`.
 * Preserves directory structure.
 */
export async function copyStaticAssets(
  staticDir: string,
  outdir: string,
): Promise<void> {
  const targetDir = join(outdir, "static");

  try {
    await Deno.stat(staticDir);
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      // Static directory doesn't exist - nothing to copy
      return;
    }
    throw err;
  }

  await ensureDir(targetDir);

  for await (
    const entry of walk(staticDir, { includeDirs: false })
  ) {
    const relativePath = entry.path.slice(staticDir.length);
    const targetPath = join(targetDir, relativePath);
    const targetParent = join(
      targetDir,
      relativePath.slice(0, relativePath.lastIndexOf("/")),
    );

    // Ensure parent directory exists
    if (targetParent !== targetDir) {
      await ensureDir(targetParent);
    }

    await Deno.copyFile(entry.path, targetPath);
  }
}
