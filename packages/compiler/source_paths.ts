// Path helpers for asset compile entry points.
//
// The dev and production asset pipelines need an absolute path to the
// browser runtime entry. The entry lives in this package so
// `@sprout/compiler` can be published and installed independently of
// the workspace layout.
//
// Island entry resolution looks for `<root>/src/islands/<id>.tsx`
// first, then `<id>.ts`. The manifest already pins an absolute path
// for each island; this helper exists for tests and for the
// `compileDevAsset({ kind: "island", ... })` path that operates
// without a manifest.
import { fromFileUrl } from "@std/path";
import { existsSync } from "@std/fs";

/**
 * Resolve the absolute path to the runtime entry file. The dev asset
 * pipeline bundles this file with esbuild and serves the result at
 * `/@sprout/runtime.js`.
 */
export function resolveRuntimeEntryFile(): string {
  return fromFileUrl(
    new URL("./runtime_entry.ts", import.meta.url),
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
