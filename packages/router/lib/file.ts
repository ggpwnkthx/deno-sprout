// lib/file.ts - File utilities
import { walk } from "@std/fs/walk";
import { basename, relative } from "@std/path";

export interface RouteFile {
  filePath: string;
  urlPattern: string;
  isReserved: boolean;
  kind?: "layout" | "middleware" | "error" | "notFound";
}

const RESERVED_BASENAMES = [
  "_layout.tsx",
  "_middleware.ts",
  "_error.tsx",
  "_404.tsx",
] as const;

const KIND_MAP: Record<string, RouteFile["kind"]> = {
  "_layout.tsx": "layout",
  "_middleware.ts": "middleware",
  "_error.tsx": "error",
  "_404.tsx": "notFound",
};

export async function getRouteFiles(routesDir: string): Promise<RouteFile[]> {
  const files: RouteFile[] = [];

  for await (
    const entry of walk(routesDir, {
      includeDirs: false,
      exts: [".ts", ".tsx"],
    })
  ) {
    const filePath = relative(routesDir, entry.path);
    const fileName = basename(
      entry.path,
    ) as (typeof RESERVED_BASENAMES)[number];

    if (RESERVED_BASENAMES.includes(fileName)) {
      files.push({
        filePath,
        urlPattern: "",
        isReserved: true,
        kind: KIND_MAP[fileName],
      });
      continue;
    }

    const urlPattern = filePathToPattern(filePath);
    if (urlPattern) {
      files.push({
        filePath,
        urlPattern,
        isReserved: false,
      });
    }
  }

  return sortRouteFiles(files);
}

export function filePathToPattern(relativePath: string): string {
  // Remove extension
  const path = relativePath.replace(/\.(tsx?|ts)$/, "");

  // Root index
  if (path === "index") {
    return "/";
  }

  // Split into segments
  const segments = path.split("/");

  // Filter out group parentheses (e.g., "(admin)" -> skip)
  // Also filter out "index" segments (blog/index -> /blog)
  const filtered = segments
    .filter((seg) => !(seg.startsWith("(") && seg.endsWith(")")))
    .filter((seg) => seg !== "index")
    .map((seg) => {
      // Catch-all: [...rest] -> *
      if (seg.startsWith("[...") && seg.endsWith("]")) {
        return "*";
      }
      // Dynamic segment: [slug] -> :slug
      if (seg.startsWith("[") && seg.endsWith("]")) {
        return ":" + seg.slice(1, -1);
      }
      return seg;
    });

  return "/" + filtered.join("/");
}

// Sort priority: static < param < wildcard
const SEGMENT_RANK: Record<string, number> = {
  static: 0,
  param: 1,
  wildcard: 2,
};

function rankSegment(segment: string): number {
  if (segment === "*") return SEGMENT_RANK.wildcard;
  if (segment.startsWith(":")) return SEGMENT_RANK.param;
  return SEGMENT_RANK.static;
}

export function sortRouteFiles(files: RouteFile[]): RouteFile[] {
  return [...files].sort((a, b) => {
    const aSegs = a.urlPattern.split("/").filter(Boolean);
    const bSegs = b.urlPattern.split("/").filter(Boolean);

    for (let i = 0; i < Math.max(aSegs.length, bSegs.length); i++) {
      const aSeg = aSegs[i] ?? "";
      const bSeg = bSegs[i] ?? "";

      // Shorter paths (fewer segments) come first
      if (!aSeg && bSeg) return -1;
      if (aSeg && !bSeg) return 1;

      const rankA = rankSegment(aSeg);
      const rankB = rankSegment(bSeg);

      if (rankA !== rankB) return rankA - rankB;

      // Same rank: alphabetical
      if (aSeg < bSeg) return -1;
      if (aSeg > bSeg) return 1;
    }

    return 0;
  });
}
