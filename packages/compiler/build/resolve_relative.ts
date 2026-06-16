// Shared relative-import resolver for the dev asset pipeline.
//
// Resolves a relative specifier (`./x`, `../x/y`) against the
// importing file's directory. Probes the full set of TypeScript and
// JavaScript extensions plus `index.*` variants so callers do not
// need to know the file's exact extension.
//
// The function is synchronous because it is called from inside an
// esbuild `onResolve` hook, which requires a synchronous callback.
// For non-esbuild callers, prefer async `Deno.stat` with `Promise.all`
// batched across many probes.
import { resolve } from "@std/path";

/**
 * Resolve a relative import specifier (`./x`, `../x/y`) against the
 * importing file's directory.
 *
 * Probes: the path as-is, plus `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`,
 * `.mts`, and `index.{ts,tsx,js,jsx,mjs,mts}`. Returns the first
 * file that exists on disk, or `null` when nothing matches.
 *
 * Uses `Deno.statSync` (one probe per candidate) because this
 * function is called from an esbuild `onResolve` hook, which is
 * synchronous by contract. For non-esbuild callers, prefer async
 * `Deno.stat` with `Promise.all` batched across many probes.
 */
export function resolveRelativeImport(
  baseDir: string,
  specifier: string,
): string | null {
  // Use `resolve` (not `join`) to combine the directory with the
  // relative specifier. `resolve` handles `.` and `..` correctly
  // and treats an absolute `specifier` as overriding `baseDir`.
  const base = resolve(baseDir, specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.mts`,
    resolve(base, "index.ts"),
    resolve(base, "index.tsx"),
    resolve(base, "index.js"),
    resolve(base, "index.jsx"),
    resolve(base, "index.mjs"),
    resolve(base, "index.mts"),
  ];
  for (const candidate of candidates) {
    try {
      const stat = Deno.statSync(candidate);
      if (stat.isFile) {
        return candidate;
      }
    } catch (_cause) {
      // Try the next candidate.
    }
  }
  return null;
}
