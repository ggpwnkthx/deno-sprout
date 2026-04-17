// manifest.ts - Asset manifest generation
export interface AssetManifest {
  islands: Record<string, string>;
  assets: Record<string, string>;
}

export function generateAssetManifest(_islands: string[]): AssetManifest {
  return { islands: {}, assets: {} };
}
