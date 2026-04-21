// lib/errors.ts - Typed error hierarchy for the router package
/**
 * Base class for all router errors.
 *
 * Subclasses carry a `code` string that callers can use to distinguish error
 * types without string-matching on the message, and a `statusCode` for mapping
 * to HTTP responses.
 *
 * @example
 * ```ts
 * import { RouteOutsideDirectory } from "@ggpwnkthx/sprout-router";
 * try {
 *   await fsRoutes({ app, dir: "./routes" });
 * } catch (e) {
 *   if (e instanceof RouteOutsideDirectory) {
 *     console.error("A route file is outside the routes directory:", e.path);
 *   }
 * }
 * ```
 */
export class RouterError extends Error {
  /** A unique identifier for this error category. */
  code: string;

  /** The recommended HTTP status code for this error. */
  statusCode: number;

  constructor(message: string, code: string, statusCode = 500) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
  }
}

/** Thrown when a layout, middleware, or route file resolves to a path outside the configured routes directory. */
export class RouteOutsideDirectory extends RouterError {
  /** The absolute path of the file that was rejected. */
  path: string;

  /** The canonical routes directory the file should have been inside. */
  routesDir: string;

  /** The URL pattern of the route that referenced the out-of-bounds file, if known. */
  routePattern?: string;

  constructor(path: string, routesDir: string, routePattern?: string) {
    super(
      `File is outside routes directory: ${path} (routesDir: ${routesDir})`,
      "ROUTE_OUTSIDE_DIR",
    );
    this.path = path;
    this.routesDir = routesDir;
    this.routePattern = routePattern;
  }
}

/** Thrown when `routeOverride` contains a path traversal pattern (`..`, `../`, `/..`). */
export class InvalidRouteOverride extends RouterError {
  /** The invalid override value. */
  override: string;

  constructor(override: string) {
    super(
      `routeOverride must not contain path traversal: ${
        JSON.stringify(override)
      }`,
      "INVALID_ROUTE_OVERRIDE",
      400,
    );
    this.override = override;
  }
}

/** Thrown when a middleware file does not export a callable `default`. */
export class MiddlewareNotCallable extends RouterError {
  /** The absolute path of the middleware file. */
  path: string;

  /** The actual type of the exported default value. */
  actualType: string;

  constructor(path: string, actualType: string) {
    super(
      `Middleware file exports a non-callable default: ${path} (got ${actualType})`,
      "MIDDLEWARE_NOT_CALLABLE",
    );
    this.path = path;
    this.actualType = actualType;
  }
}

/** Thrown when a handler function is not callable at invoke time. */
export class HandlerNotCallable extends RouterError {
  /** The absolute path of the route file whose handler failed. */
  path: string;

  /** The actual type of the exported handler value. */
  actualType: string;

  constructor(path: string, actualType: string) {
    super(
      `Handler is not a function: ${path} (got ${actualType})`,
      "HANDLER_NOT_CALLABLE",
    );
    this.path = path;
    this.actualType = actualType;
  }
}

/** Thrown when the `dir` option passed to `fsRoutes` does not point to a readable directory. */
export class RoutesDirNotFound extends RouterError {
  /** The invalid directory path that was provided. */
  path: string;

  constructor(path: string) {
    super(
      `Routes directory not found: ${path}`,
      "ROUTES_DIR_NOT_FOUND",
      500,
    );
    this.path = path;
  }
}

/** Thrown when the manifest object passed to `fsRoutesFromManifest` is malformed. */
export class InvalidManifest extends RouterError {
  /** The property that is missing or invalid. */
  field: string;

  /** The type that was expected (e.g. "string", "array"). */
  expectedType?: string;

  /** The type that was actually received, if available. */
  receivedType?: string;

  constructor(field: string, expectedType?: string, receivedType?: string) {
    const msg = expectedType
      ? `Invalid manifest: "${field}" is missing or invalid (expected ${expectedType}${
        receivedType ? `, got ${receivedType}` : ""
      })`
      : `Invalid manifest: "${field}" is missing or invalid`;
    super(msg, "INVALID_MANIFEST", 500);
    this.field = field;
    this.expectedType = expectedType;
    this.receivedType = receivedType;
  }
}
