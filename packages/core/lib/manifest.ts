// lib/manifest.ts - Island manifest loading
import { join } from "@std/path";
import { isContainedPath } from "./path.ts";

export interface IslandManifest {
  islands: Record<string, string>; // name → hashed URL
  hydrate: string; // URL to hydrate.js
}

/**
 * Guard: returns true if `v` is a valid IslandManifest shape.
 * Rejects manifests where `islands` is not a Record<string,string>,
 * `hydrate` is not a string, or any URL value contains an unsafe scheme
 * (javascript:, data:, file:, or an external origin).
 */
export function isIslandManifest(v: unknown): v is IslandManifest {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (typeof obj.islands !== "object" || obj.islands === null) return false;
  if (typeof obj.hydrate !== "string") return false;

  // Guard against javascript:, data:, and other unsafe URL schemes in hydrate
  if (!isAssetUrl(obj.hydrate as string)) return false;

  // Verify islands is a flat Record<string,string> and all values are safe asset URLs
  const islands = obj.islands as Record<string, unknown>;
  for (const k of Object.keys(islands)) {
    if (typeof islands[k] !== "string") return false;
    if (!isAssetUrl(islands[k] as string)) return false;
  }
  return true;
}

/**
 * Returns true if `url` is a safe internal asset URL.
 * Accepts absolute paths (/...) served by the static middleware.
 * Rejects javascript:, data:, file:, and external https:// URLs.
 * Exported so consumers can validate asset URLs from external sources.
 */
export function isAssetUrl(url: string): boolean {
  // Must be an absolute path (served internally by sprout static middleware)
  if (!url.startsWith("/")) return false;
  // Reject unsafe schemes that could appear in a manifest
  if (url.startsWith("javascript:")) return false;
  if (url.startsWith("data:")) return false;
  if (url.startsWith("file:")) return false;
  return true;
}

export async function loadManifest(
  distDir: string,
): Promise<IslandManifest | null> {
  try {
    const joinedPath = join(distDir, "manifest.json");

    // Resolve both paths to their real paths to catch traversal that
    // join() alone cannot (e.g. "../outside/manifest.json" resolves
    // to a sibling of distDir). Containment is checked before reading.
    let distDirReal: string;
    let manifestReal: string;
    try {
      distDirReal = await Deno.realPath(distDir);
      manifestReal = await Deno.realPath(joinedPath);
    } catch {
      return null; // path does not exist or is unreadable
    }

    const sep = Deno.build.os === "windows" ? "\\" : "/";
    if (!(await isContainedPath(manifestReal, distDirReal, sep))) {
      // Manifest path escaped distDir — reject silently
      return null;
    }

    const manifest = await import(String(joinedPath), {
      with: { type: "json" },
    });
    // JSON import returns { default: <parsed JSON> }
    const inner = (manifest as { default?: unknown }).default;
    if (isIslandManifest(inner)) {
      return inner;
    }
    return null;
  } catch {
    return null;
  }
}
