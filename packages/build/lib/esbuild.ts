// lib/esbuild.ts - esbuild wrapper
/**
 * @ggpwnkthx/sprout-build – TypeScript / JSX transpilation via esbuild.
 *
 * ## Why a subprocess wrapper
 *
 * esbuild is invoked as a `npm:` package via `Deno.Command("deno", { args: ["eval", script] })`.
 * This pattern:
 * - Gives esbuild a clean OS-level process lifecycle, avoiding Deno's
 *   subprocess leak detection in test environments.
 * - Allows the calling process to capture stdout and stderr independently.
 * - Prevents esbuild's internal threads from blocking the calling isolate.
 *
 * ## JSX configuration
 *
 * All transpilation uses Hono's JSX runtime:
 * - `jsx: "automatic"` – JSX is transformed to function calls without needing
 *   an explicit `import React`.
 * - `jsxImportSource: "@hono/hono"` – tells esbuild where to find `jsx`,
 *   `jsxs`, and `Fragment`.
 * - `format: "esm"` – output is a standard ES Module for browser use.
 * - `target: "es2022"` – targets modern browsers; adjust if older targets are
 *   needed.
 *
 * ## External modules
 *
 * Two patterns are marked external by default so they are never inlined:
 * - `"@hono/hono*"` – the Hono framework itself is loaded from a CDN / server
 *   route at runtime, not bundled.
 * - `"/_sprout/*"` – Sprout internal URL paths (island bundles, HMR) are
 *   handled by the server, not bundled.
 *
 * Additional modules can be marked external via {@link TranspileOptions.external}.
 *
 * @module
 */
// Uses esbuild via Deno.Command subprocess for clean lifecycle management.
// This approach avoids Deno's subprocess leak detection in tests.

/**
 * Options for {@link transpile}.
 */
export interface TranspileOptions {
  /**
   * Source text of the TSX / TS module to transpile.
   *
   * For island bundles this is the output of {@link generateIslandWrapper}.
   * For the hydration runtime it is an inline template string.
   */
  source: string;
  /**
   * Logical module name used in esbuild error messages and as the stdin
   * identifier (e.g. `"Counter"` or `"runtime"`).
   */
  name: string;
  /**
   * Whether to minify the output with esbuild.
   * Defaults to `true` for production island bundles, `false` for the
   * hydration runtime and mount helper (which are kept unhashed).
   */
  minify?: boolean;
  /**
   * Additional module specifiers to treat as external (not bundled).
   * The default external list (`@hono/hono*`, `/_sprout/*`) is always applied;
   * this list is appended.
   *
   * @default []
   */
  external?: string[];
  /**
   * Directory from which relative imports in `source` are resolved.
   *
   * When provided, {@link transpile} switches from esbuild's `transform()` API
   * (single-file, no import resolution) to the `build()` API with a stdin
   * entry, so esbuild can follow `import "./local.ts"` statements and produce a
   * single self-contained bundle. Required when the source contains relative
   * imports to sibling modules.
   *
   * @default undefined (uses transform() API)
   */
  resolveDir?: string;
}

/**
 * Result of a successful {@link transpile} call.
 */
export interface TranspileResult {
  /**
   * Transpiled JavaScript source text. For bundled calls this is a complete
   * ESM string with all reachable modules inlined (except externals).
   */
  code: string;
  /**
   * Any non-fatal warnings produced by esbuild, e.g. about unused imports
   * or type-only imports. Empty array when there are no warnings.
   */
  warnings: string[];
}

/**
 * Internal transpile using esbuild npm package via Deno.Command.
 * Runs esbuild in a subprocess with proper cleanup to avoid leak detection.
 */
async function transpileWithEsbuild(
  source: string,
  options: {
    name: string;
    minify: boolean;
    external: string[];
    resolveDir?: string;
    bundle: boolean;
  },
): Promise<TranspileResult> {
  const baseArgs = [
    "esbuild",
    "--loader=tsx",
    "--jsx=automatic",
    `--jsx-import-source=@hono/hono`,
    "--format=esm",
    "--target=es2022",
    `--minify=${options.minify ? "true" : "false"}`,
  ];

  if (options.bundle && options.resolveDir) {
    baseArgs.push("--bundle");
    baseArgs.push(`--outdir=/tmp`);
  }

  for (const ext of options.external) {
    baseArgs.push(`--external=${ext}`);
  }

  const script = `
import * as esbuild from 'npm:esbuild@0.24.2';
try {
${
    options.bundle && options.resolveDir
      ? `
  const result = await esbuild.build({
    stdin: {
      contents: ${JSON.stringify(source)},
      resolveDir: ${JSON.stringify(options.resolveDir)},
      loader: 'tsx',
    },
    bundle: true,
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: '@hono/hono',
    minify: ${options.minify},
    write: false,
    external: ${JSON.stringify(options.external)},
  });
  const output = result.outputFiles?.[0]?.text ?? '';
  console.log('ESBUILD_OUTPUT:' + output);
  if (result.warnings.length > 0) {
    console.warn('ESBUILD_WARNINGS:' + JSON.stringify(result.warnings.map(w => w.text)));
  }
`
      : `
  const result = await esbuild.transform(${JSON.stringify(source)}, {
    loader: 'tsx',
    format: 'esm',
    target: 'es2022',
    jsx: 'automatic',
    jsxImportSource: '@hono/hono',
    minify: ${options.minify},
  });
  console.log('ESBUILD_OUTPUT:' + result.code);
  if (result.warnings.length > 0) {
    console.warn('ESBUILD_WARNINGS:' + JSON.stringify(result.warnings.map(w => w.text)));
  }
`
  }
} finally {
  await esbuild.stop();
}
`;

  const cmd = new Deno.Command("deno", {
    args: ["eval", script],
    stdin: "null",
    stdout: "piped",
    stderr: "piped",
  });

  const child = cmd.spawn();
  const { code, stdout, stderr } = await child.output();

  const output = new TextDecoder().decode(stdout);
  const errorOutput = new TextDecoder().decode(stderr);

  if (code !== 0) {
    throw new Error(
      `esbuild failed for ${options.name}: ${errorOutput || "unknown error"}`,
    );
  }

  const warnings: string[] = [];
  const warningsMatch = output.match(/ESBUILD_WARNINGS:(\[[\s\S]*?\])/);
  if (warningsMatch) {
    try {
      warnings.push(...JSON.parse(warningsMatch[1]));
    } catch {
      // ignore parse errors
    }
  }

  const codeMatch = output.match(/ESBUILD_OUTPUT:([\s\S]*?)$/);
  const resultCode = codeMatch ? codeMatch[1] : "";

  return { code: resultCode, warnings };
}

/**
 * Transpile TSX / TS source text to browser-ready ESM JavaScript.
 *
 * This is the primary transpilation entry point used by {@link buildIslands} for
 * both island bundles (bundled, with `resolveDir`) and the inline hydration
 * runtime / mount helper (not bundled, no `resolveDir`).
 *
 * The function delegates to an esbuild subprocess that:
 * - Uses Hono's JSX runtime (`jsxImportSource: "@hono/hono"`).
 * - Strips TypeScript type annotations.
 * - Outputs `esm` format targeting `es2022`.
 * - Marks `@hono/hono*` and `/_sprout/*` as external by default.
 * - Optionally bundles relative imports when `resolveDir` is provided.
 *
 * The subprocess approach avoids Deno subprocess-leak-detection false
 * positives in test environments while keeping the API simple.
 *
 * @param options – {@link TranspileOptions}
 * @returns A {@link TranspileResult} with transpiled `code` and any esbuild
 *   `warnings`.
 *
 * @example
 * ```ts
 * const result = await transpile({
 *   source: generateIslandWrapper("Counter"),
 *   name: "Counter",
 *   minify: true,
 *   resolveDir: "islands",
 * });
 * if (result.warnings.length > 0) {
 *   console.warn("esbuild warnings:", result.warnings);
 * }
 * const hash = await contentHash(new TextEncoder().encode(result.code));
 * await writeIslandBundle("Counter", result.code, hash, "_dist");
 * ```
 */
export function transpile(
  options: TranspileOptions,
): Promise<TranspileResult> {
  // Common external patterns for JSR packages and sprout URL paths
  const defaultExternal = [
    "@hono/hono*",
    "/_sprout/*",
  ];

  return transpileWithEsbuild(options.source, {
    name: options.name,
    minify: options.minify ?? true,
    external: [...defaultExternal, ...(options.external ?? [])],
    resolveDir: options.resolveDir,
    bundle: !!options.resolveDir,
  });
}
