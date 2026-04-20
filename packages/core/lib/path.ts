/**
 * Returns true if `childPath` is contained within `parentPath`.
 * Uses realPath to resolve symlinks before checking, preventing
 * traversal like "../../outside" that join() alone cannot catch.
 * Returns false if the child path cannot be resolved or escapes.
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
