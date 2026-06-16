// `sprout build [root]` — build the project for production.
//
// M6 wires the real production build. The command:
//   1. resolves the project's config (via `loadConfig`);
//   2. calls `buildProduction` from `@sprout/compiler`;
//   3. prints the human-readable `formatBuildSummary` output.
//
// Typed `CompilerError`s (for example `BUILD_OUTDIR_UNSAFE` from a
// non-empty `outDir`) propagate as the framework error shape and
// are formatted by the CLI's `formatError` helper with their
// `code` and `details`. The CLI does not handle them explicitly.
//
// Server routes are deliberately NOT bundled in M6: the M3 spec
// permits "production may still import route source files directly
// at runtime" for the initial release. The real production serve
// (frozen manifest loader / ETag / gzip / immutable cache) lands
// in M7.
//
// `options.root` is resolved against `Deno.cwd()` by `resolveRoot`
// before being forwarded to `loadConfig`; the helper accepts
// `undefined` (no positional arg) and falls back to the current
// working directory.
//
// Permissions required: `--allow-read --allow-write --allow-env --allow-net --allow-run`.
import { loadConfig } from "@sprout/config";
import { buildProduction, formatBuildSummary } from "@sprout/compiler";
import { resolveRoot } from "./resolve_root.ts";

/** Options accepted by {@link runBuild}. */
export type RunBuildOptions = {
  /**
   * Project root. Relative paths are resolved against `Deno.cwd()`;
   * `undefined` (no positional arg) defaults to `Deno.cwd()`.
   */
  readonly root?: string;
  /** Optional path to a custom `sprout.config.ts`. */
  readonly configFile?: string;
};

/**
 * Run `sprout build`.
 *
 * M6 replaces the M5 placeholder: the production build is now
 * wired. M7 brings the real `sprout serve` (frozen manifest loader,
 * ETag, gzip negotiation, immutable cache) that consumes
 * `<outDir>/sprout.manifest.json`.
 *
 * The `debug` option is wired by `run()` from the CLI's
 * `--debug` flag. Pass `--debug` on the command line to print
 * stack traces for non-framework errors; `FrameworkError`s
 * always print their `code` and `details` without `--debug`.
 */
export async function runBuild(options: RunBuildOptions): Promise<void> {
  const root = resolveRoot(options.root);
  const config = await loadConfig({
    root,
    mode: "production",
    configFile: options.configFile,
  });
  const summary = await buildProduction({ config });
  console.log(formatBuildSummary(summary));
}
