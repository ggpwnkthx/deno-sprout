// `sprout serve [root]` — start the production server.
//
// The command is a thin orchestrator on top of `@sprout/core`:
// it calls `loadConfig + serve` with `mode: "production"`.
// The mode is what changes the asset pipeline: the M7 production
// path reads `<outDir>/sprout.manifest.json`, builds an O(1)
// public-path index, and serves content-hashed assets with
// `ETag` / `gzip` / `cache-control: immutable`. A missing
// manifest produces a typed `FROZEN_MANIFEST_MISSING` error
// that points the user at `sprout build`.
//
// `options.root` is resolved against `Deno.cwd()` by `resolveRoot`
// before being forwarded to the framework; the helper accepts
// `undefined` (no positional arg) and falls back to the current
// working directory.
//
// Permissions required: see `./registry.ts` (`COMMAND_PERMISSIONS.serve`).
import { runServeMode } from "./serve_mode.ts";
import type { ServerCommandOptions } from "../types.ts";

/** Options accepted by {@link runServe}. */
export type RunServeOptions = ServerCommandOptions;

/**
 * Run `sprout serve`.
 *
 * Resolves the root, then starts the production `Deno.serve`
 * loop. The production app loads the frozen manifest once at
 * startup, builds the O(1) public-path index, and serves
 * content-hashed assets with `ETag` / `gzip` / immutable cache
 * headers. A missing manifest produces a typed
 * `FROZEN_MANIFEST_MISSING` error pointing the user at
 * `sprout build`.
 *
 * The `debug` option is wired by `run()` from the CLI's
 * `--debug` flag. Pass `--debug` on the command line to print
 * stack traces for non-framework errors; `FrameworkError`s
 * always print their `code` and `details` without `--debug`.
 *
 * Note: `serve` calls `loadConfig` internally before binding the
 * listener, so a config-time error is still surfaced without an
 * explicit `createApp` call here.
 */
export async function runServe(options: RunServeOptions): Promise<void> {
  await runServeMode(options, "production");
}
