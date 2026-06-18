// Manifest and discovery types for `@sprout/compiler`.
//
// `DiscoveredRoute` / `DiscoveredIsland` are the raw outputs of the
// filesystem walks. `Manifest` is the validated, internal-only
// representation that downstream rendering and asset code consumes.
// The two are deliberately distinct: discovery may produce
// duplicates, conflicts, and unrouted files that the manifest
// validator rejects.
import type { CompilerErrorCode } from "../errors.ts";

/** A route pattern. Always starts with `/` and uses Hono-flavored syntax. */
export type RoutePattern = string;

/**
 * A route file discovered on disk. The `pattern` is the URL-side
 * projection of the relative file path; `kind` describes whether the
 * file is a page module, an endpoint module, or both.
 */
export type DiscoveredRoute = {
  readonly id: string;
  readonly pattern: RoutePattern;
  readonly file: string;
  readonly kind: "page" | "endpoint" | "mixed";
};

/**
 * An island file discovered on disk. `id` is the slash-normalized
 * relative path (extension stripped); `publicPath` is the canonical
 * `/@sprout/island/<id>.js` URL the runtime dynamic-imports.
 */
export type DiscoveredIsland = {
  readonly id: string;
  readonly file: string;
  readonly exportName: "default";
  readonly publicPath: string;
};

/** Discovery output for a whole project. */
export type DiscoveredProject = {
  readonly routes: readonly DiscoveredRoute[];
  readonly islands: readonly DiscoveredIsland[];
  readonly styles: {
    readonly app: string | null;
  };
};

/** A single route entry in the internal manifest. */
export type RouteEntry = {
  readonly id: string;
  readonly pattern: RoutePattern;
  readonly file: string;
};

/** A single island entry in the internal manifest. */
export type IslandEntry = {
  readonly id: string;
  readonly file: string;
  readonly exportName: "default";
  readonly publicPath: `/@sprout/island/${string}.js`;
};

/** A single global-stylesheet entry in the internal manifest. */
export type StyleEntry = {
  readonly id: string;
  readonly file: string;
  readonly publicPath: "/@sprout/app.css";
};

/**
 * The internal in-memory manifest. `version: 1` is the only valid
 * version for the M2 release; later milestones may add `version: 2`
 * with new optional fields, leaving the v1 shape intact.
 */
export type Manifest = {
  readonly version: 1;
  readonly routes: readonly RouteEntry[];
  readonly islands: readonly IslandEntry[];
  readonly styles: {
    readonly app: StyleEntry | null;
  };
};

/** The kind of a frozen asset entry on disk. */
export type FrozenAssetKind = "runtime" | "island" | "style" | "vendor";

/**
 * A single frozen asset entry on disk. The on-disk shape (and the
 * in-memory typed view) is the same: `JSON.stringify` round-trips
 * the literal-type `kind` field losslessly.
 *
 * - `kind` — which slot the asset fills in the framework.
 * - `id` — the asset's stable id inside that slot. For runtime it is
 *   always `"runtime"`; for styles it is the stylesheet id (e.g.
 *   `"app"`); for islands it is the slash-normalized island id (e.g.
 *   `"cart/AddButton"`); for vendor it is the bundle name.
 * - `publicPath` — the canonical URL the runtime dynamic-imports.
 * - `file` — the content-hashed relative path under `outDir`.
 *   Always starts with `_sprout/`.
 * - `contentType` — the resolved MIME type for the asset.
 * - `hash` — the 16-character lowercase-hex content hash.
 * - `gzipFile` — when `config.build.compress === "gzip"`, the path
 *   of the `.gz.js` / `.gz.css` companion. Otherwise absent.
 */
export type FrozenAsset = {
  readonly kind: FrozenAssetKind;
  readonly id: string;
  readonly publicPath: string;
  readonly file: string;
  readonly contentType: string;
  readonly hash: string;
  readonly gzipFile?: string;
};

/**
 * The frozen manifest written to `<outDir>/sprout.manifest.json` by
 * `buildProduction`. The on-disk shape is identical to the typed
 * view; M7's `loadFrozenIndex` hydrates from the same JSON to the
 * same shape.
 */
export type FrozenManifest = {
  readonly version: 1;
  readonly assets: readonly FrozenAsset[];
};

/**
 * The M7 production-serve in-memory index. `assets` is a
 * `publicPath → FrozenAsset` `Map` for O(1) lookups. The index
 * holds metadata only — asset bytes are read lazily by
 * `readFrozenAsset` and may be cached by the serve layer.
 *
 * The `outDir` field lets the serve layer pass the index around
 * without re-deriving the on-disk path. The `version` field is the
 * manifest's schema version, which the M7 reader validates and
 * pins to `1`.
 */
export type FrozenIndex = {
  readonly version: 1;
  /** O(1) public path → asset entry. */
  readonly assets: ReadonlyMap<string, FrozenAsset>;
  /** The on-disk `outDir` the index was loaded from. */
  readonly outDir: string;
};

/**
 * The raw bytes of a single compile step, plus the content hash.
 * The M4 dev pipeline returns its own richer result type
 * (`CompileDevAssetResult`); `BuildOutput` is the minimal in-memory
 * shape `buildProduction` aggregates into a `FrozenAsset`.
 */
export type BuildOutput = {
  readonly js: Uint8Array;
  readonly css?: Uint8Array;
  readonly map?: Uint8Array;
  readonly hash: string;
};

/**
 * A typed error reported by manifest construction. The `code` is a
 * literal string from `CompilerErrorCode`; the `details` object is
 * JSON-serializable. Declared here so the public surface from
 * `docs/sprout/packages/compiler.md` matches.
 */
export type ManifestError = {
  readonly code: CompilerErrorCode;
  readonly message: string;
  readonly details?: Readonly<Record<string, unknown>>;
};
