// lib/assets.ts - Asset management
export interface BuildOptions {
  entryPoints: string[];
  outdir: string;
  bundle?: boolean;
}

export interface BuildResult {
  outputFiles: string[];
}

export interface AssetManifest {
  islands: Record<string, string>;
  assets: Record<string, string>;
}
