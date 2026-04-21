// lib/manifest.ts - Manifest loading and validation
import { join } from "@std/path";
import { isContainedPath, SEP } from "./path.ts";
import type { RoutesManifest } from "../types.ts";
import { appError, AppErrorCode } from "../error.ts";

/**
 * Manifest describing the islands bundle produced by the build step.
 * Maps island component names to their hashed asset URLs.
 */
export interface IslandManifest {
  /**
   * Map of island component name (e.g. `"Counter"`) to its hashed asset URL
   * (e.g. `"/_sprout/islands/counter-a1b2c3.js"`).
   */
  islands: Record<string, string>;
  /**
   * URL to the centralized hydration entry point served by the deploy
   * middleware (e.g. `"/_sprout/hydrate.js"`).
   */
  hydrate: string;
}

/**
 * Guard: returns `true` if `v` is a valid `IslandManifest` shape.
 *
 * Checks that `islands` is a `Record<string, string>`, that `hydrate` is a
 * string, and that every URL uses a safe internal scheme (`/` only).
 * Rejects manifests with `javascript:`, `data:`, `file:`, or external URLs.
 *
 * @param v - Value to check
 * @returns `true` if the value has the correct shape and all URLs are safe
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
 * Returns `true` if `url` is a safe internal asset URL.
 *
 * Accepts absolute paths (`/...`) served internally by the sprout static
 * middleware. Rejects `javascript:`, `data:`, `file:`, and external
 * `https://` URLs.
 *
 * @param url - The URL string to validate
 * @returns `true` when the URL is safe to use as an internal asset reference
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

// ── Routes manifest guard ──────────────────────────────────────────────────

/**
 * Returns `true` if `path` is a safe manifest path — no parent-directory
 * traversal segments and not an absolute path. Used to validate layout chains,
 * middleware chains, and route overrides from an untrusted build manifest.
 *
 * @param path - The path string to validate
 * @returns `true` when the path contains no traversal and is not absolute
 */
function isSafeManifestPath(path: string): boolean {
  if (path.startsWith("/")) return false;
  if (path.includes("..")) return false;
  return true;
}

/**
 * Guard: returns `true` if `v` is a valid `RoutesManifest` shape.
 *
 * Checks that `routes` is an array, each entry has required string fields,
 * and chain fields contain only strings. Used to validate a manifest produced
 * by the build step before passing it to `fsRoutesFromManifest`.
 *
 * @param v - Value to check
 * @returns `true` if the value has the correct shape for a routes manifest
 */
export function isRoutesManifest(v: unknown): v is RoutesManifest {
  if (typeof v !== "object" || v === null) return false;
  const obj = v as Record<string, unknown>;
  if (!Array.isArray(obj.routes)) return false;
  for (const entry of obj.routes as unknown[]) {
    if (typeof entry !== "object" || entry === null) return false;
    const e = entry as Record<string, unknown>;
    if (typeof e.pattern !== "string") return false;
    if (typeof e.filePath !== "string") return false;
    if (typeof e.isApi !== "boolean") return false;
    if (typeof e.skipInheritedLayouts !== "boolean") return false;
    if (e.routeOverride !== undefined && typeof e.routeOverride !== "string") {
      return false;
    }
    if (e.routeOverride !== undefined && !isSafeManifestPath(e.routeOverride)) {
      return false;
    }
    if (!Array.isArray(e.layoutChain)) return false;
    if (!Array.isArray(e.middlewareChain)) return false;
    for (const p of e.layoutChain as unknown[]) {
      if (typeof p !== "string") return false;
      if (!isSafeManifestPath(p)) return false;
    }
    for (const p of e.middlewareChain as unknown[]) {
      if (typeof p !== "string") return false;
      if (!isSafeManifestPath(p)) return false;
    }
  }
  return true;
}

/**
 * Load the island manifest from `distDir/manifest.json`.
 *
 * Resolves both paths to their real paths to catch path traversal that
 * `join()` alone cannot detect (e.g. `"../outside/manifest.json"` resolves
 * to a sibling of `distDir`). The manifest path is containment-checked
 * against `distDir` before reading.
 *
 * Returns `null` if the file does not exist, cannot be read, escapes the
 * `distDir`, or does not pass `isIslandManifest` validation.
 *
 * @param distDir - The build output directory (typically `"_dist"`)
 * @returns The parsed manifest, or `null` if unavailable
 */
export async function loadManifest(
  distDir: string,
): Promise<IslandManifest | null> {
  const joinedPath = join(distDir, "manifest.json");
  try {
    // Resolve both paths in parallel to catch traversal that join() alone
    // cannot (e.g. "../outside/manifest.json" resolves to a sibling of distDir).
    // Containment is checked before reading.
    let distDirReal: string;
    let manifestReal: string;
    try {
      [distDirReal, manifestReal] = await Promise.all([
        Deno.realPath(distDir),
        Deno.realPath(joinedPath),
      ]);
    } catch (e) {
      if (e instanceof Deno.errors.NotFound) {
        return null; // path does not exist
      }
      // Permission or other I/O errors: surface as a typed failure
      throw appError(
        AppErrorCode.PERMISSION_DENIED,
        `Cannot access path while resolving manifest directories`,
        String(e),
        500,
      );
    }

    if (!(await isContainedPath(manifestReal, distDirReal, SEP))) {
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
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      return null; // manifest file absent — return null, not an error
    }
    // Permission errors: surface as a typed failure so operators can distinguish
    // "dist doesn't exist" from "read denied". Other errors (corruption,
    // malformed JSON) return null so a bad manifest doesn't crash init.
    if (e instanceof Deno.errors.PermissionDenied) {
      throw appError(
        AppErrorCode.PERMISSION_DENIED,
        `Cannot read manifest at "${joinedPath}"`,
        String(e),
        500,
      );
    }
    return null;
  }
}
