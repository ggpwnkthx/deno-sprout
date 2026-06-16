// Shared serve-mode helper for `runDev` and `runServe`.
//
// The function resolves the project root and delegates to `serve`.
// `serve` calls `loadConfig` internally, so this helper does not
// call it directly.
import { serve } from "@sprout/core";
import { resolveRoot } from "./resolve_root.ts";

/**
 * Start the development or production server.
 *
 * The function resolves `options.root` via `resolveRoot` and then
 * calls `serve({ root, mode, ... })`. The `serve` function calls
 * `loadConfig` internally before binding the listener, so a
 * config-time error is still surfaced without an explicit
 * `createApp` call here.
 *
 * @param options - `root`, `hostname`, `port`, and `configFile`.
 * @param mode - `"development"` or `"production"`.
 */
export async function runServeMode(
  options: {
    readonly root?: string;
    readonly hostname?: string;
    readonly port?: number;
    readonly configFile?: string;
  },
  mode: "development" | "production",
): Promise<void> {
  const root = resolveRoot(options.root);
  await serve({
    root,
    mode,
    configFile: options.configFile,
    hostname: options.hostname,
    port: options.port,
  });
}
