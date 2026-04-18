// lib/manifest.ts - Island manifest loading
import { join } from "@std/path";

export interface IslandManifest {
  islands: Record<string, string>; // name → hashed URL
  hydrate: string; // URL to hydrate.js
}

export async function loadManifest(
  distDir: string,
): Promise<IslandManifest | null> {
  try {
    const url = join(distDir, "manifest.json");
    const manifest = await import(String(url), { with: { type: "json" } });
    return manifest as IslandManifest;
  } catch {
    return null;
  }
}
