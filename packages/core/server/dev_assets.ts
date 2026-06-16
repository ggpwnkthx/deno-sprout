// Framework asset routes for the dev server.
//
// The dev server serves three asset kinds on demand:
//
//   - /@sprout/runtime.js    (the browser runtime entry)
//   - /@sprout/app.css       (the global stylesheet, if any)
//   - /@sprout/island/<id>.js (one per manifest island)
//
// and the matching .map routes for the JS assets. All routes use
// `cache-control: no-store` and stream the compiled bytes back as
// the response body.
//
// Asset compilation lives in @sprout/compiler; this module is
// the thin HTTP layer that validates the URL, calls the
// compiler, and shapes the response.
import type { ResolvedConfig } from "@sprout/config";
import {
  type AssetKind,
  compileDevAsset,
  type CompileDevAssetInput,
  compileDevSourceMap,
  CompilerError,
  resolveRuntimeEntryFile,
} from "@sprout/compiler";
import { NOSNIFF } from "@sprout/utils";
import { CoreError, coreErrorToResponse } from "./errors.ts";

/** Headers attached to every dev asset response. */
function noStoreHeaders(contentType: string): Headers {
  return new Headers({
    "content-type": contentType,
    "cache-control": "no-store",
    "x-content-type-options": NOSNIFF,
  });
}

/** Validate that a public path lives under the framework namespace. */
function assertReservedPath(publicPath: string): void {
  if (!publicPath.startsWith("/@sprout/")) {
    throw new CoreError(
      "STATIC_FILE_NOT_FOUND",
      "asset path must live under the /@sprout/ namespace",
      { publicPath },
    );
  }
  if (publicPath.includes("\0") || publicPath.includes("..")) {
    throw new CoreError(
      "STATIC_FILE_NOT_FOUND",
      "asset path contains forbidden characters",
      { publicPath },
    );
  }
}

/** Inputs to {@link serveDevAsset}. */
export type ServeDevAssetOptions = {
  readonly kind: AssetKind;
  readonly id: string;
  readonly entry: string;
  readonly publicPath: string;
  readonly config: ResolvedConfig;
  readonly url: URL;
};

/** Inputs to {@link serveDevSourceMap}. */
export type ServeDevSourceMapOptions = {
  readonly kind: AssetKind;
  readonly id: string;
  readonly entry: string;
  readonly config: ResolvedConfig;
};

/** Choose the JSX import source for a given asset kind. */
function jsxImportSourceFor(kind: AssetKind): string {
  if (kind === "island") {
    return "@sprout/jsx/dom";
  }
  // The runtime entry does not contain JSX today; the browser
  // bundles import Hono's DOM helpers directly. Pass the
  // canonical source so any future JSX in the runtime compiles
  // the same way the server does.
  return "@sprout/jsx/dom";
}

/**
 * Compile and serve a dev asset. Throws a `CoreError` when the
 * public path fails the framework-namespace check; the caller
 * converts the throw into a typed HTTP response.
 */
export async function serveDevAsset(opts: ServeDevAssetOptions): Promise<Response> {
  assertReservedPath(opts.publicPath);
  const input: CompileDevAssetInput = {
    kind: opts.kind,
    id: opts.id,
    entry: opts.entry,
    publicPath: opts.publicPath,
    jsxImportSource: jsxImportSourceFor(opts.kind),
    config: opts.config,
    mode: "development",
  };
  try {
    const result = await compileDevAsset(input);
    return new Response(result.js.slice().buffer, {
      headers: noStoreHeaders(result.contentType),
    });
  } catch (cause) {
    return coreErrorToResponse(toCoreError(cause, opts.publicPath));
  }
}

/**
 * Compile and serve a dev asset source map. Returns a 404 when
 * the asset did not produce a source map (e.g. the stylesheet).
 */
export async function serveDevSourceMap(
  opts: ServeDevSourceMapOptions,
): Promise<Response> {
  const input: CompileDevAssetInput = {
    kind: opts.kind,
    id: opts.id,
    entry: opts.entry,
    publicPath: `${opts.kind}/${opts.id}.js.map`,
    jsxImportSource: jsxImportSourceFor(opts.kind),
    config: opts.config,
    mode: "development",
  };
  try {
    const map = await compileDevSourceMap(input);
    if (map === null) {
      throw new CoreError(
        "STATIC_FILE_NOT_FOUND",
        "no source map for this asset",
        { publicPath: input.publicPath, kind: opts.kind },
      );
    }
    return new Response(map.slice().buffer, {
      headers: noStoreHeaders("application/json; charset=utf-8"),
    });
  } catch (cause) {
    return coreErrorToResponse(toCoreError(cause, input.publicPath));
  }
}

/**
 * Convert any thrown value into a CoreError the caller can render.
 *
 * The returned error carries a code that maps to the correct HTTP
 * status via `coreErrorToResponse`:
 *
 *   - `CoreError` → preserved as-is (already typed)
 *   - `CompilerError` (e.g. `BUILD_FAILED` from esbuild) → preserved
 *     as-is (the `ROUTE_RENDER_FAILED` code maps to 500)
 *   - any other `Error` → `ROUTE_RENDER_FAILED` (500), not
 *     `STATIC_FILE_NOT_FOUND` (404), so a syntax error in user
 *     code does not masquerade as a missing file
 */
function toCoreError(cause: unknown, publicPath: string): CoreError {
  if (cause instanceof CoreError) {
    return cause;
  }
  if (cause instanceof CompilerError) {
    // Preserve the CompilerError so `coreErrorToResponse` sees the
    // typed code. The `ROUTE_RENDER_FAILED` / 500 path handles it
    // (CompilerError codes are not in the 404 branch).
    return new CoreError(
      "ROUTE_RENDER_FAILED",
      cause.message,
      { publicPath, cause: cause.code },
    );
  }
  const message = cause instanceof Error ? cause.message : String(cause);
  return new CoreError(
    "ROUTE_RENDER_FAILED",
    `failed to compile dev asset ${publicPath}: ${message}`,
    { publicPath, cause: message },
  );
}

/** Convenience: the runtime entry input for `serveDevAsset`. */
export function runtimeServeOptions(
  config: ResolvedConfig,
  url: URL,
): ServeDevAssetOptions {
  return {
    kind: "runtime",
    id: "runtime",
    entry: resolveRuntimeEntryFile(),
    publicPath: "/@sprout/runtime.js",
    config,
    url,
  };
}

/** Convenience: the runtime entry input for `serveDevSourceMap`. */
export function runtimeSourceMapOptions(
  config: ResolvedConfig,
): ServeDevSourceMapOptions {
  return {
    kind: "runtime",
    id: "runtime",
    entry: resolveRuntimeEntryFile(),
    config,
  };
}
