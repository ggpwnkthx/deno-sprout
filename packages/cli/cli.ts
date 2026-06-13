// `run` — the public CLI entry point.
//
// `run(argv, options)` parses the command, dispatches to the
// matching `commands/*` module, catches the typed `CliError` and
// `FrameworkError` failures, formats them with `formatError`, and
// returns a `CliResult`. It NEVER calls `Deno.exit()`. The
// binary entrypoint (a small wrapper shipped in a later milestone
// as `jsr:@sprout/cli`) is the only layer that may call
// `Deno.exit()` at the boundary.
//
// The function is async and resolves with a `CliResult` even on
// the success path. The `silent` option suppresses stdout and
// stderr; tests use it to assert on the result shape without
// polluting test output. The `debug` option enables stack traces
// for non-framework errors.
import { CliError, formatError } from "./errors.ts";
import { printHelp } from "./commands/help.ts";
import { runInit } from "./commands/init.ts";
import { runDev } from "./commands/dev.ts";
import { runServe } from "./commands/serve.ts";
import { runBuild } from "./commands/build.ts";
import { runInspect } from "./commands/inspect.ts";
import { parseArgs } from "./parse_args.ts";
import type { CliOptions, CliResult, ParsedArgs } from "./types.ts";

/** The closed set of known CLI commands. */
const KNOWN_COMMANDS: readonly string[] = [
  "help",
  "init",
  "dev",
  "build",
  "serve",
  "inspect",
];

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
  switch (parsed.command) {
    case "help": {
      const out = (line: string): void => {
        if (!options.silent) {
          console.log(line);
        }
      };
      printHelp({ out });
      return { ok: true, code: 0 };
    }
    case "init": {
      await runInit({
        target: parsed.positional[0] ?? ".",
        force: parsed.flags.force === true,
        silent: options.silent,
      });
      return { ok: true, code: 0 };
    }
    case "dev": {
      const configFile = configFileFromFlags(parsed);
      await runDev({
        root: parsed.positional[0],
        hostname: hostnameFromFlags(parsed),
        port: portFromFlags(parsed),
        ...(configFile !== undefined ? { configFile } : {}),
        debug: options.debug,
      });
      return { ok: true, code: 0 };
    }
    case "serve": {
      const configFile = configFileFromFlags(parsed);
      await runServe({
        root: parsed.positional[0],
        hostname: hostnameFromFlags(parsed),
        port: portFromFlags(parsed),
        ...(configFile !== undefined ? { configFile } : {}),
        debug: options.debug,
      });
      return { ok: true, code: 0 };
    }
    case "build": {
      const configFile = configFileFromFlags(parsed);
      await runBuild({
        root: parsed.positional[0],
        ...(configFile !== undefined ? { configFile } : {}),
        debug: options.debug,
      });
      return { ok: true, code: 0 };
    }
    case "inspect": {
      const configFile = configFileFromFlags(parsed);
      await runInspect({
        root: parsed.positional[0],
        ...(configFile !== undefined ? { configFile } : {}),
        debug: options.debug,
      });
      return { ok: true, code: 0 };
    }
    default:
      throw new CliError(
        "CLI_UNKNOWN_COMMAND",
        `unknown command "${parsed.command}"`,
        { command: parsed.command, known: KNOWN_COMMANDS },
      );
  }
}

function handleError(err: unknown, options: CliOptions): CliResult {
  const message = formatError(err, { debug: options.debug === true });
  if (!options.silent) {
    console.error(message);
  }
  const error = err instanceof Error ? err : new Error(String(err));
  return { ok: false, code: 1, error };
}

// ---------------------------------------------------------------------------
// Flag helpers
// ---------------------------------------------------------------------------

function hostnameFromFlags(parsed: ParsedArgs): string | undefined {
  const value = parsed.flags.hostname;
  if (value === undefined || value === true) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new CliError(
      "CLI_INVALID_ARGS",
      "--hostname must be a non-empty string",
      { value: String(value) },
    );
  }
  return value;
}

function portFromFlags(parsed: ParsedArgs): number | undefined {
  const value = parsed.flags.port;
  if (value === undefined || value === true) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new CliError(
      "CLI_INVALID_ARGS",
      "--port must be an integer in [1, 65535]",
      { value: String(value) },
    );
  }
  const parsedPort = Number(value);
  if (!Number.isInteger(parsedPort) || parsedPort < 1 || parsedPort > 65535) {
    throw new CliError(
      "CLI_INVALID_ARGS",
      "--port must be an integer in [1, 65535]",
      { value },
    );
  }
  return parsedPort;
}

function configFileFromFlags(parsed: ParsedArgs): string | undefined {
  const value = parsed.flags.config;
  if (value === undefined || value === true) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0) {
    throw new CliError(
      "CLI_INVALID_ARGS",
      "--config must be a non-empty string",
      { value: String(value) },
    );
  }
  return value;
}
