// lib/assets.ts - Island asset management
/**
 * @ggpwnkthx/sprout-build – Island asset discovery and file I/O helpers.
 *
 * ## Discovery
 *
 * {@link discoverIslands} walks the `islands/` directory and returns every
 * `.ts` / `.tsx` file as a {@link DiscoveredIsland} entry. The island name is
 * derived from the file's base name (without extension), e.g.
 * `islands/Counter.tsx` → `name: "Counter"`.
 *
 * ## Bundle writing
 *
 * {@link writeIslandBundle} is called by {@link buildIslands} after esbuild
 * transpilation to emit the island's content-hashed bundle under
 * `_dist/islands/{Name}.{hash}.js`. The hash comes from {@link contentHash}.
 *
 * ## Static assets
 *
 * {@link copyStaticAssets} recursively copies all files from `static/` into
 * `_dist/static/`, preserving directory structure. Missing static directories
 * are silently skipped.
 *
 * @module
 */
import { walk } from "@std/fs/walk";
import { basename, extname, join } from "@std/path";
import { ensureDir } from "@std/fs/ensure-dir";

/**
 * An island discovered in the islands source directory.
 *
 * @see {@link discoverIslands}
 */
export interface DiscoveredIsland {
  /**
   * Island name derived from the source file's base name, without extension.
   *
   * Example: `islands/Counter.tsx` → `name: "Counter"`.
   *
   * This name is used:
   * - as the key in the {@link IslandManifest} `islands` map.
   * - to look up the island's default export at hydration runtime.
   * - to generate the wrapper source via {@link generateIslandWrapper}.
   */
  name: string;
  /**
   * Absolute path to the island source file (`.ts` or `.tsx`).
   *
   * This path is not used by the build itself; it is exposed so callers (e.g.
   * a watch mode or HMR server) can feed the file contents to {@link transpile}
   * without having to re-discover it.
   */
  sourcePath: string;
}

/**
 * Walk `islandsDir` recursively and return every `.ts` / `.tsx` file as a
 * {@link DiscoveredIsland}.
 *
 * Directories are excluded; only files with `.ts` or `.tsx` extensions are
 * returned. Hidden files (dotfiles) are included if they match the extension
 * filter.
 *
 * @param islandsDir – absolute path to the islands source directory (e.g.
 *   `Deno.cwd() + "/islands"`). Does not need to exist; returns `[]` gracefully.
 * @returns An array of {@link DiscoveredIsland} objects sorted by `sourcePath`
 *   (order is determined by {@link @std/fs/walk}).
 *
 * @example
 * ```ts
 * const islands = await discoverIslands("islands");
 * // [{ name: "Counter", sourcePath: "/proj/islands/Counter.tsx" }, ...]
 * ```
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
 *
 * The output path is deterministic given `name` and `hash`, making it safe to
 * call repeatedly (e.g. in watch mode). Any required parent directories are
 * created automatically with `recursive: true`.
 *
 * @param name – island name, used to construct the filename (e.g. `"Counter"`).
 * @param code – transpiled JavaScript source for the island bundle.
 * @param hash – 8-character content hash (from {@link contentHash}), used in
 *   the filename and to derive the public URL.
 * @param outdir – the build output directory (same as {@link BuildOptions.outdir}).
 * @returns The absolute path of the written file, for logging or verification.
 *
 * @example
 * ```ts
 * await writeIslandBundle("Counter", bundledJs, "ab1c2d3e", "_dist");
 * // → "/proj/_dist/islands/Counter.ab1c2d3e.js"
 * ```
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
 * Copy all files from `staticDir` into `{outdir}/static/`, preserving directory
 * structure.
 *
 * Every file found by {@link @std/fs/walk} under `staticDir` is copied to the
 * corresponding relative location inside `static/`. Empty directories are not
 * created (only files are copied).
 *
 * If `staticDir` does not exist the function returns silently — this is
 * intentional so that projects without a `static/` directory do not need a
 * build-time check.
 *
 * @param staticDir – absolute path to the static assets source directory.
 * @param outdir – the build output directory (same as {@link BuildOptions.outdir}).
 * @returns Resolves when all files have been copied.
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
