// Manifest validator.
//
// Converts a `DiscoveredProject` into the internal `Manifest`. The
// validator re-runs the duplicate checks (defense in depth) and
// rejects any public path that would escape the canonical
// `/@sprout/island/<rel>.js` template (where `<rel>` is any non-empty
// slash-separated path ending in `.js`).
//
// The framework reserves the `/@sprout/` URL namespace. Island
// entries legitimately own `/@sprout/island/...`; the validator
// accepts those and rejects any island `publicPath` that strays
// from the canonical template or contains dot-segments / NUL bytes.
import { isInsideRoot, slash } from "@sprout/utils";
import { CompilerError } from "../errors.ts";
import { isReservedAssetPath } from "./paths.ts";
import type { DiscoveredProject, IslandEntry, Manifest, RouteEntry, StyleEntry } from "./types.ts";

const ISLAND_PUBLIC_PATTERN = /^\/@sprout\/island\/.+\.js$/;

/**
 * Validate a `DiscoveredProject` and produce the internal `Manifest`.
 *
 * Routes are sorted by `pattern`; islands are sorted by `id`. The
 * styles entry is `null` when no global stylesheet was found.
 */
export function validateManifest(project: DiscoveredProject): Manifest {
  // Re-check uniqueness of route patterns and island ids / public
  // paths. Discovery already enforces these, but the validator runs
  // once more so that a hand-built `DiscoveredProject` (for example
  // from a test fixture) cannot smuggle duplicates past the public
  // boundary.
  const routePatterns = new Set<string>();
  for (const route of project.routes) {
    if (routePatterns.has(route.pattern)) {
      throw new CompilerError(
        "DISCOVERY_ROUTE_CONFLICT",
        `route pattern ${JSON.stringify(route.pattern)} appears more than once`,
        { pattern: route.pattern },
      );
    }
    routePatterns.add(route.pattern);
  }
  const islandIds = new Set<string>();
  const islandPublic = new Set<string>();
  for (const island of project.islands) {
    if (islandIds.has(island.id)) {
      throw new CompilerError(
        "MANIFEST_DUPLICATE_ID",
        `island id ${JSON.stringify(island.id)} appears more than once`,
        { id: island.id },
      );
    }
    islandIds.add(island.id);
    if (!ISLAND_PUBLIC_PATTERN.test(island.publicPath)) {
      throw new CompilerError(
        "MANIFEST_INVALID_PUBLIC_PATH",
        `island public path does not match the canonical template`,
        { id: island.id, publicPath: island.publicPath },
      );
    }
    if (island.publicPath.includes("..") || island.publicPath.includes("\0")) {
      throw new CompilerError(
        "MANIFEST_INVALID_PUBLIC_PATH",
        `island public path contains a forbidden segment`,
        { id: island.id, publicPath: island.publicPath },
      );
    }
    if (!isReservedAssetPath(island.publicPath)) {
      // Unreachable in practice (the regex enforces the prefix), but
      // the check is the public contract: every island public path
      // must live under the reserved framework URL namespace.
      throw new CompilerError(
        "MANIFEST_RESERVED_PATH_COLLISION",
        `island public path must live under the reserved framework URL namespace`,
        { id: island.id, publicPath: island.publicPath },
      );
    }
    if (islandPublic.has(island.publicPath)) {
      throw new CompilerError(
        "DISCOVERY_ISLAND_CONFLICT",
        `island public path ${JSON.stringify(island.publicPath)} appears more than once`,
        { publicPath: island.publicPath },
      );
    }
    islandPublic.add(island.publicPath);
  }

  // Build the manifest entries. Routes carry only id / pattern / file;
  // islands carry id / file / exportName / publicPath.
  const routeEntries: RouteEntry[] = project.routes
    .slice()
    .sort((a, b) => (a.pattern < b.pattern ? -1 : a.pattern > b.pattern ? 1 : 0))
    .map((r) => ({ id: r.id, pattern: r.pattern, file: r.file }));

  const islandEntries: IslandEntry[] = project.islands
    .slice()
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((i) => ({
      id: i.id,
      file: i.file,
      exportName: i.exportName,
      publicPath: i.publicPath as `/@sprout/island/${string}.js`,
    }));

  let styleEntry: StyleEntry | null = null;
  if (project.styles.app !== null) {
    const stylesPath = slash(project.styles.app);
    if (stylesPath.length === 0) {
      throw new CompilerError(
        "DISCOVERY_INVALID_ROUTE_FILE",
        `style file path is empty`,
        { path: project.styles.app },
      );
    }
    if (!stylesPath.startsWith("/")) {
      throw new CompilerError(
        "DISCOVERY_INVALID_ROUTE_FILE",
        `style file path is not absolute`,
        { path: project.styles.app },
      );
    }
    // The stylesheet path is required to live inside the project root.
    // The config layer enforces this; the validator re-checks so a
    // hand-built `DiscoveredProject` cannot smuggle a stylesheet
    // outside root. We do not have the root here, so the test is
    // "must be absolute" only.
    styleEntry = {
      id: "app",
      file: project.styles.app,
      publicPath: "/@sprout/app.css",
    };
  }

  return {
    version: 1,
    routes: routeEntries,
    islands: islandEntries,
    styles: { app: styleEntry },
  };
}

// Re-export for tests that want to assert on the helper directly.
export { isInsideRoot };
