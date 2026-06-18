// Public surface of `@sprout/cli`.
//
// `run` is a pure function that returns a `CliResult` and never
// calls `Deno.exit()`. The binary entrypoint at the bottom of
// this file is the only layer that may call `Deno.exit()` at
// the boundary, per the package's contract.
import { run } from "./cli.ts";
export { run };
export type { CliOptions, CliResult, ParsedArgs } from "./types.ts";
export { CliError, formatError } from "./errors.ts";
export type { CliErrorCode, FormatErrorOptions } from "./errors.ts";
export { printHelp } from "./commands/help.ts";
export { formatResolvedConfig } from "./commands/inspect.ts";
export type { PrintHelpOptions } from "./commands/help.ts";
export { FrameworkError } from "@sprout/utils";
export { parseArgs } from "./parse_args.ts";

// Binary entrypoint. The CLI library surface (the `run` function
// re-exported above) never calls `Deno.exit`; this is the only
// layer allowed to do so. When the file is imported as a
// library (`import { run } from "@sprout/cli"`) the block does
// not run; when it is the program entry point
// (`deno run @sprout/cli dev`) it forwards `Deno.args` to
// `run` and exits with the resulting code.
if (import.meta.main) {
  const result = await run(Deno.args);
  Deno.exit(result.code);
}
