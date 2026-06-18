// The single source of truth for command metadata.
//
// Each command declares its name, a one-line summary (used by
// `printHelp`), the permission flags it requires (also surfaced
// in the help text and the per-command JSDoc), and a `run`
// function that takes the parsed argv and CLI options and
// dispatches to the typed command implementation.
//
// The dispatch in `cli.ts` is a thin lookup; the help text is
// generated from `COMMANDS`; the per-command permission strings
// are read from `COMMAND_PERMISSIONS`. Adding a new command
// touches only this file.
import type { CliOptions, ParsedArgs } from "../types.ts";
import {
  firstPositional,
  parseConfigFlag,
  parseHostnameFlag,
  parsePortFlag,
} from "../parse_args.ts";
import { runInit } from "./init.ts";
import { runDev } from "./dev.ts";
import { runBuild } from "./build.ts";
import { runServe } from "./serve.ts";
import { runInspect } from "./inspect.ts";
import { printHelp } from "./help.ts";

/** A registered CLI command. */
export type CommandEntry = {
  /** Command name (e.g. `"init"`). */
  readonly name: string;
  /** One-line summary for the help text. */
  readonly summary: string;
  /** Run the command. Throws on failure; never calls `Deno.exit`. */
  readonly run: (parsed: ParsedArgs, options: CliOptions) => Promise<void> | void;
};

/** All registered commands keyed by name. */
export const COMMANDS: Readonly<Record<string, CommandEntry>> = {
  help: {
    name: "help",
    summary: "Print this message.",
    run: (_parsed, options) => {
      const out = (line: string): void => {
        if (!options.silent) console.log(line);
      };
      printHelp({ out });
    },
  },
  init: {
    name: "init",
    summary:
      "Scaffold a new Sprout project. Refuses to overwrite a non-empty directory unless --force is passed.",
    run: (parsed, options) =>
      runInit({
        target: firstPositional(parsed) ?? ".",
        force: parsed.flags.force === true,
        silent: options.silent,
      }),
  },
  dev: {
    name: "dev",
    summary: "Start the development server in <root> (default: current directory).",
    run: (parsed, _options) =>
      runDev({
        root: firstPositional(parsed),
        hostname: parseHostnameFlag(parsed),
        port: parsePortFlag(parsed),
        configFile: parseConfigFlag(parsed),
      }),
  },
  build: {
    name: "build",
    summary: "Build the project for production.",
    run: (parsed, options) =>
      runBuild({
        root: firstPositional(parsed),
        configFile: parseConfigFlag(parsed),
        silent: options.silent,
      }),
  },
  serve: {
    name: "serve",
    summary: "Serve the production build.",
    run: (parsed) =>
      runServe({
        root: firstPositional(parsed),
        hostname: parseHostnameFlag(parsed),
        port: parsePortFlag(parsed),
        configFile: parseConfigFlag(parsed),
      }),
  },
  inspect: {
    name: "inspect",
    summary: "Print the resolved config and the discovered manifest without starting a server.",
    run: (parsed, options) =>
      runInspect({
        root: firstPositional(parsed),
        configFile: parseConfigFlag(parsed),
        silent: options.silent,
      }),
  },
};

/** All command names in the order they appear in `COMMANDS`. */
export const KNOWN_COMMANDS: readonly string[] = Object.keys(COMMANDS);

/** Per-command permission flags surfaced by `printHelp`. */
export const COMMAND_PERMISSIONS: Readonly<Record<string, readonly string[]>> = {
  init: ["--allow-read", "--allow-write"],
  dev: ["--allow-read", "--allow-write", "--allow-env", "--allow-net", "--allow-run"],
  build: ["--allow-read", "--allow-write", "--allow-env", "--allow-net", "--allow-run"],
  serve: ["--allow-read", "--allow-env", "--allow-net"],
  inspect: ["--allow-read", "--allow-env"],
  help: [],
};
/**
 * Render the permission table as a multi-line markdown string,
 * one row per command. The first column is the command name in
 * backticks; the second column is the permission flags joined
 * by spaces in backticks, padded to align with the longest row.
 * The output matches the format used in `packages/cli/README.md`.
 */
export function formatPermissionTable(): string {
  const rows: string[] = [];
  for (const [name, flags] of Object.entries(COMMAND_PERMISSIONS)) {
    // Cmd cell: space + backtick + name + backtick + trailing spaces = 11 chars
    // e.g. "init"  -> " `init`    " (4 trailing spaces)
    // e.g. "dev"   -> " `dev`     " (5 trailing spaces)
    // e.g. "inspect" -> " `inspect` " (1 trailing space)
    const cmdCell = " " + "`" + name + "`" + " ".repeat(8 - name.length);
    if (flags.length === 0) {
      // Help row: flags cell is " (none)" + 59 spaces = 66 chars
      const flagsCell = " " + "(none)" + " ".repeat(59);
      rows.push("|" + cmdCell + "|" + flagsCell + "|");
    } else {
      const flagsText = flags.join(" ");
      // Flags cell: space + backtick + flags + backtick + trailing = 66 chars
      // e.g. "--allow-read --allow-write" (27 chars) -> 1+1+27+1+36 = 66
      const trailingSpaces = 66 - 1 - flagsText.length - 1 - 1; // -1 space, -1 backtick, -1 backtick
      const flagsCell = " " + "`" + flagsText + "`" + " ".repeat(trailingSpaces);
      rows.push("|" + cmdCell + "|" + flagsCell + "|");
    }
  }
  return rows.join("\n");
}
