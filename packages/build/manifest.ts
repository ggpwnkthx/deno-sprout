// manifest.ts - Asset manifest generation
import { encodeHex } from "@std/encoding/hex";
import { ensureDir } from "@std/fs/ensure-dir";
import { join } from "@std/path";

export interface IslandManifest {
  /**
   * Map from island name to its hashed bundle URL.
   * e.g. { "Counter": "/_sprout/islands/Counter.a1b2c3d4.js" }
   */
  islands: Record<string, string>;
  /**
   * URL of the hydration runtime bundle.
   * e.g. "/_sprout/hydrate.js"  (unhashed - always revalidated)
   */
  hydrate: string;
}

/**
 * Compute a content hash from bundle bytes.
 * Returns the first 8 hex characters of SHA-256.
 */
export async function contentHash(bytes: Uint8Array): Promise<string> {
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    bytes.buffer as ArrayBuffer,
  );
  const hashArray = new Uint8Array(hashBuffer);
  const hex = encodeHex(hashArray);
  return hex.slice(0, 8);
}

/**
 * Build an IslandManifest from a map of island names to their compiled code.
 * Computes content hashes and builds full hashed URLs.
 */
export async function buildManifest(
  islands: Record<string, string>, // name → compiled JS text
): Promise<IslandManifest> {
  const manifest: IslandManifest = {
    islands: {},
    hydrate: "/_sprout/hydrate.js",
  };

  for (const [name, code] of Object.entries(islands)) {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(code);
    const hash = await contentHash(bytes);
    manifest.islands[name] = `/_sprout/islands/${name}.${hash}.js`;
  }

  return manifest;
}

/**
 * Write the manifest to `{outdir}/manifest.json`.
 */
export async function writeManifest(
  manifest: IslandManifest,
  outdir: string,
): Promise<void> {
  await ensureDir(outdir);
  const path = join(outdir, "manifest.json");
  const content = JSON.stringify(manifest, null, 2);
  await Deno.writeFile(path, new TextEncoder().encode(content));
}

/**
 * Read and parse `{distDir}/manifest.json`.
 * Returns null if the file does not exist (dev mode).
 */
export async function readManifest(
  distDir: string,
): Promise<IslandManifest | null> {
  const path = join(distDir, "manifest.json");
  try {
    const content = await Deno.readFile(path);
    const text = new TextDecoder().decode(content);
    return JSON.parse(text) as IslandManifest;
  } catch (err) {
    if (err instanceof Deno.errors.NotFound) {
      return null;
    }
    throw err;
  }
}
