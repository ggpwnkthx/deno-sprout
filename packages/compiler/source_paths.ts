// Path helpers for asset compile entry points.
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
 *
 * The entry lives in `@sprout/runtime` (the browser-side package) and
 * is resolved via `import.meta.resolve` so the compiler package does not
 * need to maintain its own copy of the entry source.
 */
export function resolveRuntimeEntryFile(): string {
  return fromFileUrl(
    new URL(import.meta.resolve("@sprout/runtime/runtime_entry.ts")),
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
