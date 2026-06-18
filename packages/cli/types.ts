// Public type surface for `@sprout/cli`.
//
// The CLI's `run` function is a pure function that returns a
// `CliResult` and never calls `Deno.exit()`. Callers (the binary
// entrypoint shipped in a later milestone, embedded scripts, or
// tests) inspect the result and decide what to do with the exit
// code.
//
// The shape intentionally mirrors the `CliResult` documented in
// `docs/sprout/packages/cli.md` and is the only public contract
// the binary entrypoint depends on.

/**
 * The outcome of a `run` invocation.
 *
 * - `ok: true, code: 0` — the command ran and returned without
 *   throwing. Note that for commands like `serve` and `dev` this
 *   only covers the call returning; the actual `Deno.serve` loop
 *   is awaited (so the promise resolves only when the server
 *   exits).
 * - `ok: false, code: 1` — the command threw. `error` carries the
 *   original `Error` (a `FrameworkError` for known framework
 *   failures, or a plain `Error` for anything else). The error has
 *   already been human-formatted and printed to stderr by `run`
 *   unless `silent: true` was passed.
 */
export type CliResult =
  | { readonly ok: true; readonly code: 0 }
  | { readonly ok: false; readonly code: 1; readonly error: Error };

/** Options accepted by {@link run}. */
export type CliOptions = {
  /**
   * When true, do not write to stdout/stderr. Callers can read the
   * `CliResult.error` field instead. Tests pass `silent: true` to
   * keep the test output clean.
   */
  readonly silent?: boolean;
  /**
   * When true, print stack traces for non-framework errors. Has
   * no effect on `FrameworkError`s, which always include their
   * `code` and selected `details`.
   */
  readonly debug?: boolean;
};

/**
 * The result of `parseArgs` — the structured view of the raw
 * `argv` array. The first non-flag argument is the `command`;
 * subsequent non-flag arguments are `positional`; `--flag`
 * arguments populate `flags` with `boolean` or `string` values.
 */
export type ParsedArgs = {
  /** The first non-flag positional argument, or `"help"` when absent. */
  readonly command: string;
  /** Subsequent non-flag positional arguments, in order. */
  readonly positional: readonly string[];
  /**
   * Parsed flags. `--flag` produces `true`; `--flag value` and
   * `--flag=value` produce the string `value`. Single-letter
   * `-x` style flags are not supported.
   */
  readonly flags: Readonly<Record<string, string | boolean>>;
};

// ---------------------------------------------------------------------------
// Shared option shapes
// ---------------------------------------------------------------------------

/**
 * Base shape for any command that accepts an optional project root.
 * The JSDoc is intentionally shared; command-specific options
 * intersect this type.
 */
export type RootOption = {
  /** Project root. `undefined` defaults to `Deno.cwd()`. Relative paths are resolved against it. */
  readonly root?: string;
};

/**
 * Options for commands that bind a server (dev, serve, and the
 * internal serve-mode helper). Mirrors the `serve` function's
 * accepted shape.
 */
export type ServerCommandOptions = RootOption & {
  /** Optional override for the listening hostname. */
  readonly hostname?: string;
  /** Optional override for the listening port. */
  readonly port?: number;
  /** Optional path to a custom `sprout.config.ts`. */
  readonly configFile?: string;
};

/**
 * Options for commands that resolve a project config without
 * binding a server (build, inspect).
 */
export type ConfigCommandOptions = RootOption & {
  /** Optional path to a custom `sprout.config.ts`. */
  readonly configFile?: string;
};
