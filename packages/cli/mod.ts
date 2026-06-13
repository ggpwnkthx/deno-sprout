// Public surface of `@sprout/cli`.
//
// M5 ships the CLI MVP: `run` (a pure function that returns a
// `CliResult`), the `printHelp` and `formatError` helpers, and
// the typed `CliError`. M6 wires `buildProduction` into `run`;
// M7 replaces the M5 placeholder `serve` with the real
// production serve. The CLI library surface (the `run` function
// re-exported below) never calls `Deno.exit()`; the binary
// entrypoint at the bottom of this file is the only layer that
// may, per the M5 spec (`docs/sprout/packages/cli.md`).
import { run } from "./cli.ts";
export { run };
export type { CliOptions, CliResult, ParsedArgs } from "./types.ts";
export { CliError, formatError } from "./errors.ts";
export type { CliErrorCode, FormatErrorOptions } from "./errors.ts";
export { printHelp } from "./commands/help.ts";
export { parseArgs } from "./parse_args.ts";

// Binary entrypoint. The CLI library surface (the `run` function
// re-exported above) never calls `Deno.exit`; this is the only
// layer allowed to do so, per the M5 spec
// (`docs/sprout/packages/cli.md`). When the file is imported as a
// library (`import { run } from "@sprout/cli"`) the block does
// not run; when it is the program entry point
// (`deno run jsr:@sprout/cli dev`) it forwards `Deno.args` to
// `run` and exits with the resulting code.
if (import.meta.main) {
  const result = await run(Deno.args);
  Deno.exit(result.code);
}
