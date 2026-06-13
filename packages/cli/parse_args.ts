// Hand-rolled argument parser for the M5 CLI surface.
//
// The parser is intentionally tiny: it understands the shapes the
// M5 command set actually needs and rejects everything else with a
// typed `CliError("CLI_INVALID_ARGS", ...)`. There is no support
// for short flags (`-f`), `--flag value` shorthand (use
// `--flag=value` instead), or for repeating flags — the M5 surface
// has no consumer that needs them.
//
// Rules:
//
//   - The first non-flag argument is the `command`. If absent,
//     the result's `command` is `"help"`. The first non-flag
//     argument is removed from `positional`; subsequent non-flag
//     arguments are the command's `positional` arguments.
//   - `--flag` produces `flags[flag] = true`.
//   - `--flag=value` produces `flags[flag] = value`.
//   - `--flag value` produces `flags[flag] = value` only when
//     `value` does not start with `--`. A bare `--flag` at the end
//     of `argv` throws `CLI_INVALID_ARGS`.
//   - `-x` style flags throw `CLI_INVALID_ARGS`.
//   - `--` ends flag parsing: everything after it is positional.
import { CliError } from "./errors.ts";
import type { ParsedArgs } from "./types.ts";

/**
 * Parse a raw `argv` array into a structured `ParsedArgs`.
 *
 * @throws {CliError} When the input contains an unsupported flag
 *   shape (single-letter flags, dangling `--flag` at the end of
 *   `argv`).
 */
export function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};

  let command: string | null = null;
  let i = 0;
  let afterDoubleDash = false;
  while (i < argv.length) {
    const arg = argv[i]!;
    if (afterDoubleDash) {
      positional.push(arg);
      i += 1;
      continue;
    }
    if (arg === "--") {
      afterDoubleDash = true;
      i += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      const body = arg.slice(2);
      if (body.length === 0) {
        // Bare `--` handled above; an empty flag name is a parse
        // error.
        throw new CliError(
          "CLI_INVALID_ARGS",
          "empty flag name",
          { arg },
        );
      }
      const eq = body.indexOf("=");
      if (eq >= 0) {
        const name = body.slice(0, eq);
        const value = body.slice(eq + 1);
        if (name.length === 0) {
          throw new CliError(
            "CLI_INVALID_ARGS",
            "empty flag name before '='",
            { arg },
          );
        }
        flags[name] = value;
        i += 1;
        continue;
      }
      // `--flag` (boolean) or `--flag value`.
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[body] = next;
        i += 2;
        continue;
      }
      flags[body] = true;
      i += 1;
      continue;
    }
    if (arg.startsWith("-") && arg.length > 1) {
      // Single-letter flags are not supported. The M5 surface does
      // not need them; flagging this as invalid keeps the parser
      // predictable.
      throw new CliError(
        "CLI_INVALID_ARGS",
        `unsupported short flag "${arg}"; use --flag or --flag=value`,
        { arg },
      );
    }
    // Positional: the first one is the command, the rest are args.
    if (command === null) {
      command = arg;
    } else {
      positional.push(arg);
    }
    i += 1;
  }

  return {
    command: command ?? "help",
    positional,
    flags: Object.freeze(flags),
  };
}
