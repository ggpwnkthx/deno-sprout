// init.ts - Project scaffolding
import { parseArgs } from "@std/cli/parse-args";
import { type InitOptions, initProject } from "./template.ts";

export type { InitOptions };
export { initProject };

/**
 * CLI entry point.
 */
export async function main() {
  const flags = parseArgs(Deno.args, {
    string: ["name", "template"],
    boolean: ["yes", "help"],
    default: { template: "minimal", yes: false },
  });

  if (flags.help) {
    console.log(`🌱 Sprout - Create a new project

Usage:
  deno task init [options]

Options:
  --name <name>     Project name / directory
  --template <name> Template: minimal | blog | api (default: minimal)
  --yes             Skip prompts
  --help            Show this message
`);
    return;
  }

  try {
    await initProject({
      name: flags.name,
      template: flags.template as "minimal" | "blog" | "api",
      yes: flags.yes,
    });
  } catch (err) {
    if (err instanceof Error) {
      console.error("Error:", err.message);
    }
    Deno.exit(1);
  }
}

if (import.meta.main) {
  main();
}
