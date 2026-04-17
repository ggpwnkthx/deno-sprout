// bundler.ts - Production bundler
export interface BuildOptions {
  entryPoints: string[];
  outdir: string;
}

export interface BuildResult {
  outputFiles: string[];
}

export function buildIslands(
  _options: BuildOptions,
): BuildResult {
  return { outputFiles: [] };
}
