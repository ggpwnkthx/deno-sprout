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
  const lines: string[] = [];
  lines.push(
    `Sprout project: ${project.routes.length} routes, ${project.islands.length} islands, styles: ${
      project.styles.app === null ? "no" : "yes"
    }`,
  );
  if (project.routes.length > 0) {
    lines.push("  Routes:");
    const sorted = project.routes.slice().sort((a, b) =>
      a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0
    );
    for (const route of sorted) {
      lines.push(`    ${route.pattern.padEnd(28)} ${route.file}  (${route.kind})`);
    }
  }
  if (project.islands.length > 0) {
    lines.push("  Islands:");
    const sorted = project.islands.slice().sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    for (const island of sorted) {
      lines.push(`    ${island.publicPath.padEnd(28)} ${island.file}`);
    }
  }
  if (project.styles.app !== null) {
    lines.push("  Styles:");
    lines.push(`    /@sprout/app.css             ${project.styles.app}`);
  }
  return lines.join("\n") + "\n";
}

/**
 * Format a `Manifest` as a human-readable multi-line string. Same
 * shape as `formatDiscoveredProject`; the manifest version is
 * included in the header.
 */
export function formatManifest(manifest: Manifest): string {
  const lines: string[] = [];
  lines.push(
    `Sprout manifest v${manifest.version}: ${manifest.routes.length} routes, ${manifest.islands.length} islands, styles: ${
      manifest.styles.app === null ? "no" : "yes"
    }`,
  );
  if (manifest.routes.length > 0) {
    lines.push("  Routes:");
    for (const route of manifest.routes) {
      lines.push(`    ${route.pattern.padEnd(28)} ${route.file}`);
    }
  }
  if (manifest.islands.length > 0) {
    lines.push("  Islands:");
    for (const island of manifest.islands) {
      lines.push(`    ${island.publicPath.padEnd(28)} ${island.file}`);
    }
  }
  if (manifest.styles.app !== null) {
    lines.push("  Styles:");
    lines.push(`    ${manifest.styles.app.publicPath.padEnd(28)} ${manifest.styles.app.file}`);
  }
  return lines.join("\n") + "\n";
}
