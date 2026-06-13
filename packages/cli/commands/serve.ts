// `sprout serve [root]` — start the production server.
//
// The command is a thin orchestrator on top of `@sprout/core`:
// it calls `loadConfig + createApp + serve` with
// `mode: "production"`. The mode is what changes the asset
// pipeline: the M7 production path reads `<outDir>/sprout.manifest.json`,
// builds an O(1) public-path index, and serves content-hashed
// assets with `ETag` / `gzip` / `cache-control: immutable`. A
// missing manifest produces a typed `FROZEN_MANIFEST_MISSING`
// error that points the user at `sprout build`.
//
// The `createApp` call is included for symmetry with the dev path
// and to surface a config-time error before the listener binds;
// the actual request lifecycle is owned by `serve`, which
// rebuilds the app internally.
//
// `options.root` is resolved against `Deno.cwd()` by `resolveRoot`
// before being forwarded to the framework; the helper accepts
// `undefined` (no positional arg) and falls back to the current
// working directory.
//
// Permissions required: `--allow-read --allow-env --allow-net`.
import { loadConfig } from "@sprout/config";
import { createApp, serve } from "@sprout/core";
import { resolveRoot } from "./resolve_root.ts";

/** Options accepted by {@link runServe}. */
export type RunServeOptions = {
  /**
   * Project root. Relative paths are resolved against `Deno.cwd()`;
   * `undefined` (no positional arg) defaults to `Deno.cwd()`.
   */
  readonly root?: string;
  /** Optional override for the listening hostname. */
  readonly hostname?: string;
  /** Optional override for the listening port. */
  readonly port?: number;
  /** Optional path to a custom `sprout.config.ts`. */
  readonly configFile?: string;
  /** When true, run with `--debug` semantics (currently unused; reserved). */
  readonly debug?: boolean;
};

/**
 * Run `sprout serve`.
 *
 * Resolves the config, builds the production app, and starts the
 * `Deno.serve` loop. The production app loads the frozen manifest
 * metadata once at startup, builds the O(1) public-path index, and
 * serves content-hashed assets with `ETag` / gzip / immutable
 * cache headers. A missing manifest produces a typed
 * `FROZEN_MANIFEST_MISSING` error pointing the user at
 * `sprout build`.
 *
 * The `debug` option is wired by `run()` from the CLI's
 * `--debug` flag. Pass `--debug` on the command line to print
 * stack traces for non-framework errors; `FrameworkError`s
 * always print their `code` and `details` without `--debug`.
 */
export async function runServe(options: RunServeOptions): Promise<void> {
  const root = resolveRoot(options.root);
  const config = await loadConfig({
    root,
    mode: "production",
    configFile: options.configFile,
  });
  await createApp({
    root,
    mode: "production",
    configFile: options.configFile,
  });
  await serve({
    root,
    mode: "production",
    configFile: options.configFile,
    hostname: options.hostname ?? config.server.hostname,
    port: options.port ?? config.server.port,
  });
}
