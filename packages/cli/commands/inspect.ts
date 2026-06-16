// `sprout inspect [root]` — print the resolved config and the
// discovered project without starting a server.
//
// The command is the M5 analog of a build's `--dry-run` flag: it
// resolves the config, runs `discoverProject`, validates the
// manifest, and prints both the config summary and the discovered
// project in a human-readable form. It never starts an HTTP
// listener and never writes to `outDir`.
//
// `options.root` is resolved against `Deno.cwd()` by `resolveRoot`
// before being forwarded to `loadConfig`; the helper accepts
// `undefined` (no positional arg) and falls back to the current
// working directory.
//
// Permissions required: `--allow-read --allow-env`.
import { loadConfig, type ResolvedConfig } from "@sprout/config";
import { discoverProject, formatDiscoveredProject, validateManifest } from "@sprout/compiler";
import { resolveRoot } from "./resolve_root.ts";

/** Options accepted by {@link runInspect}. */
export type RunInspectOptions = {
  /**
   * Project root. Relative paths are resolved against `Deno.cwd()`;
   * `undefined` (no positional arg) defaults to `Deno.cwd()`.
   */
  readonly root?: string;
  /** Optional path to a custom `sprout.config.ts`. */
  readonly configFile?: string;
};

/**
 * Run `sprout inspect`.
 *
 * Resolves the config, prints a one-line-per-field summary, runs
 * discovery, and prints the discovered project.
 *
 * The `debug` option is wired by `run()` from the CLI's
 * `--debug` flag. Pass `--debug` on the command line to print
 * stack traces for non-framework errors; `FrameworkError`s
 * always print their `code` and `details` without `--debug`.
 */
export async function runInspect(options: RunInspectOptions): Promise<void> {
  const root = resolveRoot(options.root);
  const config = await loadConfig({
    root,
    configFile: options.configFile,
  });
  printResolvedConfig(config);
  const project = await discoverProject(config);
  // validateManifest surfaces typed errors (duplicate routes,
  // duplicate islands, dot-segments in publicPath) before the
  // user starts a server.
  validateManifest(project);
  console.log(formatDiscoveredProject(project));
}

/**
 * Print a one-line-per-field summary of a `ResolvedConfig`. The
 * format is intentionally compact: one line per top-level field
 * and one line per nested object key.
 */
export function printResolvedConfig(config: ResolvedConfig): void {
  console.log(`[sprout] resolved config:`);
  console.log(`  root:        ${config.root}`);
  console.log(`  srcDir:      ${config.srcDir}`);
  console.log(`  publicDir:   ${config.publicDir ?? "(none)"}`);
  console.log(`  outDir:      ${config.outDir}`);
  console.log(`  server:      ${config.server.hostname}:${config.server.port}`);
  console.log(`  build.compress:    ${config.build.compress}`);
  console.log(`  build.sourcemap:   ${config.build.sourcemap}`);
  console.log(`  build.minify:      ${config.build.minify}`);
  console.log(
    `  build.frozenAssetCache: ${
      config.build.frozenAssetCache === "none"
        ? "none"
        : `${config.build.frozenAssetCache.kind} (maxBytes=${config.build.frozenAssetCache.maxBytes})`
    }`,
  );
  console.log(`  styles.app:  ${config.styles.app ?? "(none)"}`);
}
