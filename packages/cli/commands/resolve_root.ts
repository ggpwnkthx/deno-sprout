// Resolve a CLI-supplied project root to a slash-normalized absolute path.
//
// `runDev` / `runServe` / `runBuild` / `runInspect` all JSDoc their
// `root` field as "Relative paths are resolved against `Deno.cwd()`";
// this helper is the implementation. It mirrors the `resolveTarget`
// helper that `commands/init.ts` has used since M5, but accepts
// `undefined` (no positional arg) and returns `Deno.cwd()`.
//
// Errors are surfaced as `CLI_INVALID_ARGS` so the CLI's existing
// `formatError` path prints a typed, human-readable message. NUL
// bytes and an empty string (other than `undefined`) are rejected;
// absolute and relative paths are normalized with `@sprout/utils`'s
// `slash` helper. The function never reads the filesystem beyond
// `Deno.cwd()`.
import { isAbsolute, join } from "@std/path";
import { slash } from "@sprout/utils";
import { CliError } from "../errors.ts";

/**
 * Resolve a CLI-supplied `root` to a slash-normalized absolute path.
 *
 * - `undefined` returns `Deno.cwd()` (the spec's documented default
 *   for every root-bearing command).
 * - An absolute path is returned slash-normalized.
 * - A relative path is joined to `Deno.cwd()` and slash-normalized.
 *
 * @throws {CliError} `CLI_INVALID_ARGS` when `root` is the empty
 *   string or contains a NUL byte.
 */
export function resolveRoot(root: string | undefined): string {
  if (root === undefined) {
    return slash(Deno.cwd());
  }
  if (root.length === 0) {
    throw new CliError(
      "CLI_INVALID_ARGS",
      "project root is empty",
      { root },
    );
  }
  if (root.includes("\0")) {
    throw new CliError(
      "CLI_INVALID_ARGS",
      "project root contains a NUL byte",
      { root },
    );
  }
  const absolute = isAbsolute(root) ? root : join(Deno.cwd(), root);
  return slash(absolute);
}
