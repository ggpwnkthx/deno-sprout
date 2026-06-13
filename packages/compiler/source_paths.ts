// Path helpers for asset compile entry points.
//
// `@sprout/compiler` does not depend on `@sprout/core` (the package
// graph forbids cycles), but the dev asset pipeline needs the
// absolute path to the runtime entry file that ships in
// `packages/core`. The path is resolved by walking up two directories
// from the compiler package layout, which is a tight enough coupling
// to keep out of a runtime dependency.
//
// Island entry resolution looks for `<root>/src/islands/<id>.tsx`
// first, then `<id>.ts`. The manifest already pins an absolute path
// for each island; this helper exists for tests and for the
// `compileDevAsset({ kind: "island", ... })` path that operates
// without a manifest.
import { fromFileUrl } from "@std/path";
import { existsSync } from "@std/fs";

/**
 * Resolve the absolute path to the runtime entry file that
 * `packages/core` exports as `@sprout/core/runtime-entry`. The dev
 * asset pipeline bundles this file with esbuild and serves the
 * result at `/@sprout/runtime.js`.
 */
export function resolveRuntimeEntryFile(): string {
  return fromFileUrl(
    new URL("../core/runtime.entry.ts", import.meta.url),
  );
}

/**
 * Resolve the on-disk path of an island source file given its slash-
 * normalized id (e.g. `cart/AddButton`) and a project root. Looks for
 * `src/islands/<id>.tsx` first, then `src/islands/<id>.ts`. Returns
 * `null` when neither file exists; the caller is responsible for
 * surfacing a typed error.
 */
export function resolveIslandEntryFile(id: string, root: string): string | null {
  const tsxPath = `${stripTrailingSlash(root)}/src/islands/${id}.tsx`;
  if (existsSync(tsxPath)) {
    return tsxPath;
  }
  const tsPath = `${stripTrailingSlash(root)}/src/islands/${id}.ts`;
  if (existsSync(tsPath)) {
    return tsPath;
  }
  return null;
}

function stripTrailingSlash(value: string): string {
  if (value.length > 1 && value.endsWith("/")) {
    return value.slice(0, -1);
  }
  return value;
}
