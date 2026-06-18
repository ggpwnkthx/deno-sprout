// `sprout help` — the usage text.
//
// `printHelp` is a pure function: it writes one line per call to
// the `out` callback. The default `out` is `console.log`. The
// function is driven by the `COMMANDS` registry: command names
// and summaries come from `COMMANDS`; permission flags come from
// `COMMAND_PERMISSIONS`. There is no other source of truth.
import { COMMAND_PERMISSIONS, COMMANDS } from "./registry.ts";

/** Options for {@link printHelp}. */
export type PrintHelpOptions = {
  readonly out?: (line: string) => void;
};

/**
 * Print the Sprout CLI usage text.
 *
 * @param options.out Per-line sink. Defaults to `console.log`.
 */
export function printHelp(options: PrintHelpOptions = {}): void {
  const out = options.out ?? ((line) => console.log(line));
  out("sprout <command> [dir] [flags]");
  out("");
  out("Commands:");
  for (const cmd of Object.values(COMMANDS)) {
    out(`  ${cmd.name.padEnd(14)}${cmd.summary}`);
  }
  out("");
  out("Flags:");
  out("  --force           Overwrite a non-empty target during `init`.");
  out("  --debug           Print stack traces for non-framework errors.");
  out("  --hostname <h>    Override server.hostname for dev/serve.");
  out("  --port <p>        Override server.port for dev/serve.");
  out("  --config <file>   Path to sprout.config.ts (default: <root>/sprout.config.ts).");
  out("");
  out("Permission requirements (printed in --debug):");
  for (const [name, flags] of Object.entries(COMMAND_PERMISSIONS)) {
    if (flags.length === 0) continue;
    out(`  ${name}: ${flags.join(" ")}`);
  }
}
