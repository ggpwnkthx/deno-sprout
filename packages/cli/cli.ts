// `run` — the public CLI entry point.
//
// `run(argv, options)` parses the command, dispatches to the
// matching `commands/*` module, catches the typed `CliError` and
// `FrameworkError` failures, formats them with `formatError`, and
// returns a `CliResult`. It NEVER calls `Deno.exit()`. The
// binary entrypoint (`mod.ts`'s `import.meta.main` block
// at the bottom) is the only layer that may call
// `Deno.exit()` at the boundary.
//
// The function is async and resolves with a `CliResult` even on
// the success path. The `silent` option suppresses stdout and
// stderr; tests use it to assert on the result shape without
// polluting test output. The `debug` option enables stack traces
// for non-framework errors.
import { CliError, formatError } from "./errors.ts";
import { COMMANDS, KNOWN_COMMANDS } from "./commands/registry.ts";
import { parseArgs } from "./parse_args.ts";
import type { CliOptions, CliResult, ParsedArgs } from "./types.ts";

/**
 * Run a CLI invocation end-to-end.
 *
 * @param argv Argument list, typically `Deno.args`. Pass `[]` to
 *   default to the `help` command.
 * @param options `silent` suppresses stdout/stderr; `debug` adds
 *   stack traces for non-framework errors. Both default to false.
 *   The CLI also accepts `--debug` as a positional flag; when set,
 *   it is folded into `options.debug` so the formatter sees the
 *   right value.
 * @returns A `CliResult` describing success or failure. The
 *   function never throws, never calls `Deno.exit()`, and never
 *   writes to stdout/stderr when `silent: true`.
 */
export async function run(argv: readonly string[], options: CliOptions = {}): Promise<CliResult> {
  let parsed: ParsedArgs;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    return handleError(err, options);
  }

  // Merge the CLI `--debug` flag into `options.debug` so the
  // formatter sees the right value. Explicit `options.debug`
  // (e.g. from a test) takes precedence.
  const mergedOptions: CliOptions = {
    ...options,
    debug: options.debug === true ? true : parsed.flags.debug === true,
  };

  try {
    return await dispatch(parsed, mergedOptions);
  } catch (err) {
    return handleError(err, mergedOptions);
  }
}

// ---------------------------------------------------------------------------
// Internal: dispatch and error handling
// ---------------------------------------------------------------------------

async function dispatch(parsed: ParsedArgs, options: CliOptions): Promise<CliResult> {
  const command = COMMANDS[parsed.command];
  if (!command) {
    throw new CliError(
      "CLI_UNKNOWN_COMMAND",
      `unknown command "${parsed.command}"`,
      { command: parsed.command, known: KNOWN_COMMANDS },
    );
  }
  await command.run(parsed, options);
  return { ok: true, code: 0 };
}

function handleError(err: unknown, options: CliOptions): CliResult {
  const message = formatError(err, { debug: options.debug === true });
  if (!options.silent) {
    console.error(message);
  }
  const error = err instanceof Error ? err : new Error(String(err));
  return { ok: false, code: 1, error };
}
