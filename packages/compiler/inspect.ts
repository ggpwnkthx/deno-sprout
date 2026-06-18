// `inspect`-style formatter for the discovered project and manifest.
//
// `formatDiscoveredProject` produces a multi-line, human-readable
// summary. `formatManifest` is the same shape but typed against
// `Manifest` for tests and for the CLI's `inspect` command.
//
// The output is not stable across platform line endings; callers
// should not snapshot the exact whitespace. Tests assert on
// substrings rather than full strings.
import type { DiscoveredProject, Manifest } from "./manifest/types.ts";

/**
 * Format a `DiscoveredProject` as a human-readable multi-line string.
 *
 * The output has the shape:
 *
 * ```text
 * Sprout project: 7 routes, 2 islands, styles: yes
 *   Routes:
 *     /                          /abs/.../index.tsx          (page)
 *     /about                     /abs/.../about.tsx          (page)
 *     ...
 *   Islands:
 *     /@sprout/island/Counter.js /abs/.../Counter.tsx
 *     ...
 *   Styles:
 *     /@sprout/app.css           /abs/.../app.css
 * ```
 *
 * The trailing newline is included.
 */
export function formatDiscoveredProject(project: DiscoveredProject): string {
  return formatView({
    title:
      `Sprout project: ${project.routes.length} routes, ${project.islands.length} islands, styles: ${
        project.styles.app === null ? "no" : "yes"
      }`,
    routes: project.routes.map((r) => ({
      pattern: r.pattern,
      file: r.file,
      kind: r.kind as string | null,
    })),
    islands: project.islands.map((i) => ({ publicPath: i.publicPath, file: i.file })),
    styles: project.styles.app === null
      ? null
      : { publicPath: "/@sprout/app.css", file: project.styles.app },
  });
}

/**
 * Format a `Manifest` as a human-readable multi-line string. Same
 * shape as `formatDiscoveredProject`; the manifest version is
 * included in the header.
 */
export function formatManifest(manifest: Manifest): string {
  return formatView({
    title:
      `Sprout manifest v${manifest.version}: ${manifest.routes.length} routes, ${manifest.islands.length} islands, styles: ${
        manifest.styles.app === null ? "no" : "yes"
      }`,
    routes: manifest.routes.map((r) => ({ pattern: r.pattern, file: r.file, kind: null })),
    islands: manifest.islands.map((i) => ({ publicPath: i.publicPath, file: i.file })),
    styles: manifest.styles.app === null
      ? null
      : { publicPath: manifest.styles.app.publicPath, file: manifest.styles.app.file },
  });
}

type RouteLine = { pattern: string; file: string; kind: string | null };
type IslandLine = { publicPath: string; file: string };
type StyleLine = { publicPath: string; file: string } | null;

/**
 * Shared formatter for routes/islands/styles view. Emits a multi-line
 * string with the given title header.
 */
function formatView(opts: {
  title: string;
  routes: readonly RouteLine[];
  islands: readonly IslandLine[];
  styles: StyleLine;
}): string {
  const lines: string[] = [opts.title];
  if (opts.routes.length > 0) {
    lines.push("  Routes:");
    const sorted = opts.routes.slice().sort((a, b) =>
      a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0
    );
    for (const route of sorted) {
      const kindSuffix = route.kind !== null ? `  (${route.kind})` : "";
      lines.push(`    ${route.pattern.padEnd(28)} ${route.file}${kindSuffix}`);
    }
  }
  if (opts.islands.length > 0) {
    lines.push("  Islands:");
    const sorted = opts.islands.slice().sort((a, b) =>
      a.publicPath < b.publicPath ? -1 : a.publicPath > b.publicPath ? 1 : 0
    );
    for (const island of sorted) {
      lines.push(`    ${island.publicPath.padEnd(28)} ${island.file}`);
    }
  }
  if (opts.styles !== null) {
    lines.push("  Styles:");
    lines.push(`    ${opts.styles.publicPath.padEnd(28)} ${opts.styles.file}`);
  }
  return lines.join("\n") + "\n";
}
