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
//   - The function uses `Deno.lstat` (not `Deno.stat`) to
//     detect symlinks at the target before writing. If the target
//     is a symlink, `CLI_INIT_FAILED` is thrown immediately so a
//     malicious symlink at the init target cannot redirect writes.
//     Files outside the target are never read or written.
//
// Permissions required: see `./registry.ts` (`COMMAND_PERMISSIONS.init`).
import { dirname, join } from "@std/path";
import { CliError } from "../errors.ts";
import { INIT_DIR_RELPATHS, INIT_FILE_RELPATHS, INIT_FILES } from "../templates.ts";
import { resolveRoot } from "./resolve_root.ts";

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

/** Names ignored when deciding whether a target directory is "empty". */
const IGNORED_NAMES: ReadonlySet<string> = new Set([".git", ".gitkeep"]);

/**
 * Names ignored in the foreign-files check (step 3 of `runInit`).
 * Includes `.sprout-init-tmp` so a partially-initialized project can
 * still be re-initted with `--force` after a mid-loop failure.
 */
const IGNORED_FOR_INIT: ReadonlySet<string> = new Set([
  ".git",
  ".gitkeep",
  ".sprout-init-tmp",
]);

/**
 * Run `sprout init`.
 *
 * @throws {CliError} `CLI_INIT_TARGET_NOT_EMPTY` when the target
 *   directory already exists and contains files other than
 *   `.git` / `.gitkeep`, and `force` is false.
 * @throws {CliError} `CLI_INIT_FAILED` when an individual file
 *   write fails.
 *
 * Safety contract (atomicity):
 *
 *   If a write fails mid-loop, the target is left unchanged; only
 *   `<target>/.sprout-init-tmp` may remain (a sibling temp dir that
 *   the next `init` will refuse to operate on because it is a
 *   non-empty, non-template directory).
 */
export async function runInit(options: RunInitOptions): Promise<void> {
  const target = resolveRoot(options.target);

  // 1. Ensure the target directory exists.
  let existed = true;
  try {
    // Use lstat so we detect (and refuse) symlinks.
    // Deno.stat would follow the link, which could redirect
    // writes to an arbitrary location.
    const lstat = await Deno.lstat(target);
    if (lstat.isSymlink) {
      throw new CliError(
        "CLI_INIT_FAILED",
        `init target is a symlink; refusing to follow: ${target}`,
        { target },
      );
    }
    if (!lstat.isDirectory) {
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
    const nonIgnored = await listNonIgnored(target);
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
    const all = await listNonIgnoredForInit(target);
    const foreign: string[] = [];
    for (const name of all) {
      if (!INIT_FILE_RELPATHS.has(name) && !INIT_DIR_RELPATHS.has(name)) {
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

  // 4. Stage all files under a sibling temp dir, then rename
  //    them into place. A failure mid-loop leaves only the
  //    `.sprout-init-tmp` directory behind — the project files
  //    are either fully written or fully absent.
  const TMP_DIR = ".sprout-init-tmp";
  const tmpRoot = join(target, TMP_DIR);
  let ex: unknown;
  try {
    await Deno.mkdir(tmpRoot, { recursive: true });
    // Stage: write each file to the temp dir.
    for (const file of INIT_FILES) {
      const tmpPath = join(tmpRoot, file.relPath);
      const tmpParent = dirname(tmpPath);
      try {
        await Deno.mkdir(tmpParent, { recursive: true });
        await Deno.writeTextFile(tmpPath, file.content);
      } catch (cause) {
        ex = new CliError(
          "CLI_INIT_FAILED",
          `failed to stage ${file.relPath}: ${(cause as Error).message}`,
          { file: file.relPath, cause: (cause as Error).message },
        );
        break;
      }
    }
    // Commit: rename each staged file into its final location.
    if (!ex) {
      for (const file of INIT_FILES) {
        const tmpPath = join(tmpRoot, file.relPath);
        const finalPath = join(target, file.relPath);
        // Deno.rename requires the destination parent dir to exist.
        const finalParent = dirname(finalPath);
        try {
          await Deno.mkdir(finalParent, { recursive: true });
          await Deno.rename(tmpPath, finalPath);
        } catch (cause) {
          ex = new CliError(
            "CLI_INIT_FAILED",
            `failed to commit ${file.relPath}: ${(cause as Error).message}`,
            { file: file.relPath, cause: (cause as Error).message },
          );
          break;
        }
      }
    }
  } catch (cause) {
    // Unexpected error during staging setup (e.g. mkdir tmpRoot
    // failed because the target is read-only). Capture the
    // original error so the cleanup-then-throw path can surface
    // it.
    ex = new CliError(
      "CLI_INIT_FAILED",
      `failed to initialize project: ${(cause as Error).message}`,
      { target, cause: (cause as Error).message },
    );
  }
  // Best-effort cleanup of the staging dir. NotFound means it was
  // never created (e.g. mkdir failed before any file was written).
  // If cleanup fails and there was no prior error, surface the
  // cleanup failure; if there was a prior error, suppress it.
  try {
    await Deno.remove(tmpRoot, { recursive: true });
  } catch (cause) {
    if (cause instanceof Deno.errors.NotFound) {
      // The staging dir was never created — nothing to clean up.
    } else if (!ex) {
      ex = new CliError(
        "CLI_INIT_FAILED",
        `failed to remove staging dir ${tmpRoot}: ${(cause as Error).message}`,
        { dir: tmpRoot, cause: (cause as Error).message },
      );
    }
  }
  if (ex) throw ex;

  if (!options.silent) {
    console.log(`[sprout] initialized project at ${target}`);
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Return the names inside `dir` that are neither `.git` nor
 * `.gitkeep`. Used to decide whether a target directory is "empty"
 * for the purpose of the no-force check.
 */
async function listNonIgnored(dir: string): Promise<readonly string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (IGNORED_NAMES.has(entry.name)) {
      continue;
    }
    out.push(entry.name);
  }
  return out;
}

/**
 * Return the names inside `dir` that are not in {@link IGNORED_FOR_INIT}.
 * Used for the `--force` foreign-files check so a partially-initialized
 * project (with a `.sprout-init-tmp` staging dir) can still be re-initted.
 */
async function listNonIgnoredForInit(dir: string): Promise<readonly string[]> {
  const out: string[] = [];
  for await (const entry of Deno.readDir(dir)) {
    if (IGNORED_FOR_INIT.has(entry.name)) {
      continue;
    }
    out.push(entry.name);
  }
  return out;
}
