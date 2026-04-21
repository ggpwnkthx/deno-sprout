/**
 * The OS path separator, used for containment checks.
 * `"\\"` on Windows, `"/"` elsewhere.
 */
export const SEP = Deno.build.os === "windows" ? "\\" : "/";

/**
 * Returns `true` if `childPath` is contained within `parentPath`.
 *
 * Uses `Deno.realPath` to resolve symlinks before checking, preventing
 * traversal attacks (e.g. `"../../outside"`) that `join()` alone cannot
 * catch. Returns `false` if `childPath` cannot be resolved or escapes
 * `parentPath`.
 *
 * @param childPath - The path to check (typically resolved to an absolute path)
 * @param parentPath - The parent directory or root path
 * @param sep - Path separator for the current OS (`"/"` on Linux/macOS,
 *   `"\\"` on Windows)
 * @returns `true` when `childPath` is at or inside `parentPath`
 */
export async function isContainedPath(
  childPath: string,
  parentPath: string,
  sep: string,
): Promise<boolean> {
  try {
    const childReal = await Deno.realPath(childPath);
    return (
      childReal === parentPath ||
      childReal.startsWith(parentPath + sep)
    );
  } catch {
    return false;
  }
}
