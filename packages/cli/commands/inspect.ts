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
// Permissions required: see `./registry.ts` (`COMMAND_PERMISSIONS.inspect`).
import { loadConfig, type ResolvedConfig } from "@sprout/config";
import { discoverProject, formatDiscoveredProject, validateManifest } from "@sprout/compiler";
import { resolveRoot } from "./resolve_root.ts";
import type { ConfigCommandOptions } from "../types.ts";

/** Options accepted by {@link runInspect}. */
export type RunInspectOptions = ConfigCommandOptions & { readonly silent?: boolean };

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
  printResolvedConfig(config, { silent: options.silent });
  const project = await discoverProject(config);
  // validateManifest surfaces typed errors (duplicate routes,
  // duplicate islands, dot-segments in publicPath) before the
  // user starts a server.
  validateManifest(project);
  if (!options.silent) {
    console.log(formatDiscoveredProject(project));
  }
}

/**
 * Format a `ResolvedConfig` as a list of human-readable lines.
 * Pure: no I/O, no `console.log`. Used by `printResolvedConfig`
 * and by tests that want to assert on the rendered output
 * without installing a `console.log` spy.
 */
export function formatResolvedConfig(
  config: ResolvedConfig,
): readonly string[] {
  return [
    `[sprout] resolved config:`,
    `  root:        ${config.root}`,
    `  srcDir:      ${config.srcDir}`,
    `  publicDir:   ${config.publicDir ?? "(none)"}`,
    `  outDir:      ${config.outDir}`,
    `  server:      ${config.server.hostname}:${config.server.port}`,
    `  build.compress:    ${config.build.compress}`,
    `  build.sourcemap:   ${config.build.sourcemap}`,
    `  build.minify:      ${config.build.minify}`,
    `  build.frozenAssetCache: ${
      config.build.frozenAssetCache === "none"
        ? "none"
        : `${config.build.frozenAssetCache.kind} (maxBytes=${config.build.frozenAssetCache.maxBytes})`
    }`,
    `  styles.app:  ${config.styles.app ?? "(none)"}`,
  ];
}

/**
 * Print the resolved config (one line per field) to the sink.
 * Defaults to `console.log`; an alternate sink can be injected
 * for testing.
 */
export function printResolvedConfig(
  config: ResolvedConfig,
  options?: { silent?: boolean; out?: (line: string) => void },
): void {
  if (options?.silent) return;
  const out = options?.out ?? ((line: string) => console.log(line));
  for (const line of formatResolvedConfig(config)) {
    out(line);
  }
}
