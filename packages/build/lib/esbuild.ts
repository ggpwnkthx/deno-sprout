// lib/esbuild.ts - esbuild wrapper
// Uses esbuild via Deno.Command subprocess for clean lifecycle management.
// This approach avoids Deno's subprocess leak detection in tests.

export interface TranspileOptions {
  /** Source text of the TSX/TS file. */
  source: string;
  /** Logical module name used in error messages (e.g. "Counter"). */
  name: string;
  /** Minify output. Default true for production, false for dev. */
  minify?: boolean;
  /**
   * Treat these module specifiers as external (not bundled).
   * Default: [] - bundle everything.
   */
  external?: string[];
  /**
   * Directory from which relative imports in `source` are resolved.
   * When provided, `transpile()` switches from esbuild's `transform()` API
   * (single-file, no import resolution) to the `build()` API with a `stdin`
   * entry so esbuild can follow and bundle relative imports.
   */
  resolveDir?: string;
}

export interface TranspileResult {
  code: string;
  /** Any non-fatal warnings from esbuild. */
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
 * Transpile TSX/TS source text to a browser-ready ESM JavaScript string.
 * Uses esbuild npm package via Deno.Command subprocess for clean lifecycle.
 *
 * JSX is transformed to @hono/hono/jsx calls:
 *   jsxImportSource: "@hono/hono"
 *   jsx: "automatic"
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
