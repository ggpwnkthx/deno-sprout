// `sprout dev [root]` — start the development server.
//
// The function is a thin orchestrator on top of `@sprout/core`:
// it calls `loadConfig + serve` with `mode: "development"`.
// The optional `--hostname` and `--port` flags override the
// resolved config's `server.hostname` and `server.port`. The
// `--config` flag is forwarded to `loadConfig`.
//
// `options.root` is resolved against `Deno.cwd()` by
// `resolveRoot` before being forwarded to the framework; the
// helper accepts `undefined` (no positional arg) and falls back to
// the current working directory, which is the spec's documented
// default for every root-bearing command.
//
// Permissions required: `--allow-read --allow-write --allow-env
// --allow-net --allow-run`.
import { runServeMode } from "./serve_mode.ts";

/** Options accepted by {@link runDev}. */
export type RunDevOptions = {
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
};

/**
 * Run `sprout dev`.
 *
 * Resolves the root, then starts the `Deno.serve` loop. The
 * returned promise resolves when the server exits (for example,
 * on a SIGINT or on `serve`'s `AbortSignal`).
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
export async function runDev(options: RunDevOptions): Promise<void> {
  await runServeMode(options, "development");
}
