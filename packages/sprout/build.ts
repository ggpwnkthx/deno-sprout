/**
 * Production build entry point.
 *
 * Bundles all island modules and generates a static routes manifest under
 * `./_dist`. This output is consumed by `@ggpwnkthx/sprout-build` during
 * deployment.
 *
 * @example
 * ```bash
 * # Run via workspace task (monorepo)
 * deno task build
 *
 * # Run via JSR (any Deno project)
 * deno run -A jsr:@ggpwnkthx/sprout/build
 * ```
 *
 * @module
 */
import { buildIslands } from "@ggpwnkthx/sprout-build/bundler";
await buildIslands({ outdir: "./_dist" });
