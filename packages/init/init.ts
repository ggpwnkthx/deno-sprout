// init.ts - CLI entry point for project scaffolding
//
// Exposes the `main` async function as the executable entry point,
// parsing CLI flags and delegating to the {@link initProject} core.

import { parseArgs } from "@std/cli/parse-args";
import {
  InitError,
  type InitOptions,
  initProject,
  validateTemplateName,
} from "./template.ts";

export type { InitOptions };

/**
 * Re-exports {@link initProject} for use as a library.
 *
 * @example
 * ```ts
 * import { initProject } from "@ggpwnkthx/sprout-init/init";
 * await initProject({ name: "my-app", template: "minimal" });
 * ```
 */
export { initProject };

/**
 * Parses `Deno.args`, invokes {@link initProject}, and handles errors.
 *
 * Exits with status `1` on any thrown error.
 *
 * **Usage:**
 * ```bash
 * deno task init --name my-app --template blog
 * deno run -A jsr:@ggpwnkthx/sprout/init --name my-app --template minimal
 * ```
 *
 * **Flags:**
 * - `--name <name>`     Project name / directory (required)
 * - `--template <name>` Template name: `minimal`, `blog`, or `api` (default: `minimal`)
 * - `--help`            Print help and exit
 */
export async function main(): Promise<void> {
  const flags = parseArgs(Deno.args, {
    string: ["name", "template"],
    boolean: ["help"],
    default: { template: "minimal" },
  });

  if (flags.help) {
    console.log(`🌱 Sprout - Create a new project

Usage:
  deno task init [options]

Options:
  --name <name>     Project name / directory
  --template <name> Template: minimal | blog | api (default: minimal)
  --help            Show this message
`);
    return;
  }

  if (!flags.name) {
    console.error("Error: Project name is required. Use --name <name>.");
    Deno.exit(1);
  }

  try {
    const name: string = flags.name;
    const template = flags.template
      ? validateTemplateName(flags.template)
      : undefined;
    await initProject({ name, template });
  } catch (err: unknown) {
    if (err instanceof InitError) {
      console.error(`[${err.code}] ${err.message}`);
    } else if (err instanceof Error) {
      console.error("Error:", err.message);
    }
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
