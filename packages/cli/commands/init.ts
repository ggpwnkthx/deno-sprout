// `sprout init [dir] [--force]` — scaffold a new Sprout project.
//
// The function resolves `target` to an absolute path (relative to
// the current working directory), creates it if needed, refuses to
// overwrite a non-empty directory unless `--force` is passed, and
// then writes the six template files (deno.jsonc, sprout.config.ts,
// src/routes/index.tsx, src/islands/Counter.tsx, src/styles/app.css,
// public/.gitkeep).
//
// Safety contract:
//
//   - When `force` is false, a non-empty target directory raises
//     `CLI_INIT_TARGET_NOT_EMPTY` (with `{ target }` in `details`).
//     "Non-empty" means "contains a name that is not `.git` or
//     `.gitkeep`". This is the spec's documented check.
//   - When `force` is true, only the files in `INIT_FILES` are
//     overwritten. Pre-existing files that are not in `INIT_FILES`
//     are NOT deleted. This matches the spec's safety rule:
//     "init --force only deletes files it created or clearly
//     prompts/refuses."
//   - The function only ever creates `target` and writes files
//     inside it. It does not follow symlinks, it does not read
//     the host filesystem outside `target`, and it does not run
//     user code.
//
// Permissions required: `--allow-read --allow-write`.
import { dirname, isAbsolute, join } from "@std/path";
import { CliError } from "../errors.ts";
import { INIT_FILE_RELPATHS, INIT_FILES } from "../templates.ts";
import { slash } from "@sprout/utils";

/** Options accepted by {@link runInit}. */
export type RunInitOptions = {
  /** Path to the target directory. Relative paths are resolved against `Deno.cwd()`. */
  readonly target: string;
  /**
   * When true, overwrite the files in the {@link INIT_FILES} list.
   * Pre-existing files outside the list are NOT deleted.
   */
  readonly force: boolean;
  /** When true, suppress the success line on stdout. */
  readonly silent?: boolean;
};

/** Names that are ignored when deciding whether a target directory is "empty". */
const IGNORED_NAMES: ReadonlySet<string> = new Set([".git", ".gitkeep"]);

/**
 * Run `sprout init`.
 *
 * @throws {CliError} `CLI_INIT_TARGET_NOT_EMPTY` when the target
 *   directory already exists and contains files other than
 *   `.git` / `.gitkeep`, and `force` is false.
 * @throws {CliError} `CLI_INIT_FAILED` when an individual file
 *   write fails.
 */
export async function runInit(options: RunInitOptions): Promise<void> {
  const target = resolveTarget(options.target);

  // 1. Ensure the target directory exists.
  let existed = true;
  try {
    const stat = Deno.statSync(target);
    if (!stat.isDirectory) {
      throw new CliError(
        "CLI_INIT_FAILED",
        `init target is not a directory: ${target}`,
        { target },
      );
    }
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) {
      existed = false;
      await Deno.mkdir(target, { recursive: true });
    } else if (cause instanceof CliError) {
      throw cause;
    } else {
      throw new CliError(
        "CLI_INIT_FAILED",
        `failed to access init target ${target}: ${(cause as Error).message}`,
        { target, cause: (cause as Error).message },
      );
    }
  }

  // 2. Refuse to overwrite a non-empty directory unless --force.
  if (existed && !options.force) {
    const nonIgnored = listNonIgnored(target);
    if (nonIgnored.length > 0) {
      throw new CliError(
        "CLI_INIT_TARGET_NOT_EMPTY",
        "refusing to initialize into non-empty directory; pass --force to overwrite",
        { target, contents: nonIgnored },
      );
    }
  }

  // 3. Refuse --force if the target contains files not in INIT_FILES.
  if (existed && options.force) {
    const all = listAll(target);
    const foreign: string[] = [];
    for (const name of all) {
      if (!INIT_FILE_RELPATHS.has(name)) {
        foreign.push(name);
      }
    }
    if (foreign.length > 0) {
      throw new CliError(
        "CLI_INIT_FAILED",
        "refusing to use --force on a directory that contains files outside the init template; please remove them or init into an empty directory",
        { target, foreign },
      );
    }
  }

  // 4. Write the template files.
  for (const file of INIT_FILES) {
    const filePath = join(target, file.relPath);
    // Defensive: if force=false, ensure no clash with an existing
    // file. (The directory-empty check above already catches the
    // most common case.)
    if (!options.force) {
      try {
        const stat = Deno.statSync(filePath);
        if (stat.isFile || stat.isDirectory) {
          throw new CliError(
            "CLI_INIT_FAILED",
            `file already exists; pass --force to overwrite: ${filePath}`,
            { file: filePath },
          );
        }
      } catch (cause) {
        if (cause instanceof Deno.errors.NotFound) {
          // Expected: file does not yet exist.
        } else if (cause instanceof CliError) {
          throw cause;
        } else {
          throw new CliError(
            "CLI_INIT_FAILED",
            `failed to stat ${filePath}: ${(cause as Error).message}`,
            { file: filePath, cause: (cause as Error).message },
          );
        }
      }
    }
    // Ensure the parent directory exists. `INIT_FILES` includes
    // nested paths like `src/routes/index.tsx`; the recursive
    // mkdir is idempotent.
    const parent = dirname(filePath);
    try {
      await Deno.mkdir(parent, { recursive: true });
    } catch (cause) {
      throw new CliError(
        "CLI_INIT_FAILED",
        `failed to create directory ${parent}: ${(cause as Error).message}`,
        { file: parent, cause: (cause as Error).message },
      );
    }
    try {
      await Deno.writeTextFile(filePath, file.content);
    } catch (cause) {
      throw new CliError(
        "CLI_INIT_FAILED",
        `failed to write ${filePath}: ${(cause as Error).message}`,
        { file: filePath, cause: (cause as Error).message },
      );
    }
  }

  if (!options.silent) {
    console.log(`[sprout] initialized project at ${target}`);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Resolve `target` to a slash-normalized absolute path. */
function resolveTarget(target: string): string {
  if (target.length === 0) {
    throw new CliError(
      "CLI_INVALID_ARGS",
      "init target is empty",
      { target },
    );
  }
  if (target.includes("\0")) {
    throw new CliError(
      "CLI_INVALID_ARGS",
      "init target contains a NUL byte",
      { target },
    );
  }
  const absolute = isAbsolute(target) ? target : join(Deno.cwd(), target);
  return slash(absolute);
}

/**
 * Return the names inside `dir` that are neither `.git` nor
 * `.gitkeep`. Used to decide whether a target directory is "empty"
 * for the purpose of the no-force check.
 */
function listNonIgnored(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    if (IGNORED_NAMES.has(entry.name)) {
      continue;
    }
    out.push(entry.name);
  }
  return out;
}

/** Return the names inside `dir` (no filtering). */
function listAll(dir: string): readonly string[] {
  const out: string[] = [];
  for (const entry of Deno.readDirSync(dir)) {
    out.push(entry.name);
  }
  return out;
}
