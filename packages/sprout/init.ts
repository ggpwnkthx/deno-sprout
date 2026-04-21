/**
 * Project scaffolding entry point.
 *
 * Executes the `main` function from `@ggpwnkthx/sprout-init`, which scaffolds
 * a new Sprout project in the current working directory.
 *
 * @example
 * ```bash
 * # Run via workspace task (monorepo)
 * deno task init
 *
 * # Run via JSR (any Deno project)
 * deno run -Ar jsr:@ggpwnkthx/sprout/init
 * ```
 *
 * @module
 */
import { main } from "@ggpwnkthx/sprout-init/init";
await main();
