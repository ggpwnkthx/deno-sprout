/**
 * Development server entry point.
 *
 * Spins up a file-watching dev server with HMR (Hot Module Replacement)
 * support. The server binds to port 8000 on localhost and uses
 * `Deno.cwd()` as the project root for file watching and routing.
 *
 * @example
 * ```bash
 * # Run via workspace task (monorepo)
 * deno task dev
 *
 * # Run via JSR (any Deno project)
 * deno run -A jsr:@ggpwnkthx/sprout/dev
 * ```
 *
 * @module
 */
import { createDevServer } from "@ggpwnkthx/sprout-dev/server";
const server = await createDevServer({ root: Deno.cwd() });
Deno.serve({ port: 8000 }, server.fetch);
