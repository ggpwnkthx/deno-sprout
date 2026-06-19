// Shared test helpers for the `@sprout/config` test suite.
//
// These utilities are private to the test suite and are NOT exported
// as part of the package's public surface.
import { assertRejects } from "jsr:@std/assert@1";
import { fromFileUrl, join } from "@std/path";
import { ConfigError, loadConfig } from "./mod.ts";
import type { ConfigErrorCode } from "./mod.ts";

/** Absolute path to the repo root (parent of `packages/config`). */
export const REPO_ROOT: string = fromFileUrl(new URL("../../", import.meta.url));

/**
 * Create a fresh temp directory for a single test.
 * The cleanup callback removes the directory recursively.
 */
export async function makeTempDir(
  prefix: string,
): Promise<{ readonly path: string; cleanup: () => Promise<void> }> {
  const dir = await Deno.makeTempDir({ prefix });
  return {
    path: dir,
    cleanup: async () => {
      try {
        await Deno.remove(dir, { recursive: true });
      } catch (_cause) {
        // best-effort cleanup
      }
    },
  };
}

/** Write a file at `path` with `contents`. */
export async function writeFile(path: string, contents: string): Promise<void> {
  await Deno.writeTextFile(path, contents);
}

/** Write a `sprout.config.ts` file inside `root`. */
export async function writeConfig(root: string, body: string): Promise<void> {
  await Deno.writeTextFile(join(root, "sprout.config.ts"), body);
}

/**
 * Assert that `loadConfig({ root })` throws a `ConfigError` with the
 * given `expectedCode`.
 */
export async function expectConfigError(
  root: string,
  expectedCode: ConfigErrorCode,
): Promise<void> {
  const err = await assertRejects(() => loadConfig({ root }), ConfigError);
  if (err.code !== expectedCode) {
    throw new Error(
      `Expected error code "${expectedCode}" but got "${err.code}"`,
    );
  }
}
