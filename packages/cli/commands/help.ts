// `sprout help` — the usage text.
//
// `printHelp` is a pure function: it writes one line per call to
// the `out` callback. The default `out` is `console.log`. Tests
// inject a custom `out` to capture the output. The function
// returns `void`; the multi-line text is the sum of the calls.
//
// The text matches the spec in `docs/sprout/packages/cli.md`,
// including the "Permission requirements (printed in --debug):"
// block at the end. The block's `(printed in --debug)` is a hint
// to the user: the same information is printed by the binary
// entrypoint when the `--debug` flag is set, and it is also part
// of the default help text so users see it on first run.
import { printDebugPermissionNote } from "./debug_permissions.ts";

/** Options for {@link printHelp}. */
export type PrintHelpOptions = {
  /**
   * Sink for each line of the usage text. Defaults to
   * `console.log`. The function calls `out` once per line and
   * never appends a trailing newline (the sink decides whether
   * to add one).
   */
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
  out("  init [dir]        Scaffold a new Sprout project. Refuses to overwrite");
  out("                    a non-empty directory unless --force is passed.");
  out("  dev [root]        Start the development server in <root>");
  out("                    (default: current directory).");
  out("  build [root]      Build the project for production. (M5 placeholder;");
  out("                    full implementation lands in M6.)");
  out("  serve [root]      Serve the production build. (M5 placeholder; full");
  out("                    implementation lands in M7.)");
  out("  inspect [root]    Print the resolved config and the discovered");
  out("                    manifest without starting a server.");
  out("  help              Print this message.");
  out("");
  out("Flags:");
  out("  --force           Overwrite a non-empty target during `init`.");
  out("  --debug           Print stack traces for non-framework errors.");
  out("  --hostname <h>    Override server.hostname for dev/serve.");
  out("  --port <p>        Override server.port for dev/serve.");
  out("  --config <file>   Path to sprout.config.ts (default: <root>/sprout.config.ts).");
  out("");
  out("Permission requirements (printed in --debug):");
  printDebugPermissionNote(out);
}
