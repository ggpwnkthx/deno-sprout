// `RequestContext` factory and the framework's response helpers.
//
// The context is a small, framework-shaped wrapper over `Request`
// and `URL`. The response helpers (`html`, `json`, `text`, `redirect`,
// `render`) follow Hono's ergonomics: each returns a fully-typed
// `Response` and never throws on normal inputs.
//
// `render` is the only helper that needs to know about the HTML
// shell. To keep `buildRequestContext` callable from contexts that
// have not been wired into a `createApp` shell (for example, in
// future middlewares or unit tests), the shell metadata is passed
// via an optional `shellInfo` field. When `shellInfo` is `null`,
// `render` falls back to `html`.
import { NOSNIFF } from "@sprout/utils";
import type { Renderable, RequestContext } from "./types.ts";
import { wrapHtml } from "./render_route.tsx";

/** Shell metadata captured by `createApp` for use in `render`. */
export type ShellInfo = {
  readonly runtimePublicPath: string;
  readonly stylesheetPublicPath: string | null;
};

export type BuildRequestContextOptions = {
  readonly request: Request;
  readonly url: URL;
  readonly params: Readonly<Record<string, string>>;
  /** Defaults to a fresh `Map`. */
  readonly locals?: Map<string, unknown>;
  /** Shell metadata; pass `null` (or omit) to disable `render`. */
  readonly shellInfo?: ShellInfo | null;
};

/**
 * Merge `init.headers` (caller-supplied) with framework security
 * defaults (`content-type` and `x-content-type-options: nosniff`).
 * Caller headers win on conflict so a route handler can override
 * the type (e.g. emit `text/csv`).
 */
export function withSecurityHeaders(
  init: ResponseInit | undefined,
  contentType: string,
): ResponseInit {
  const existing = init?.headers ? Object.fromEntries(new Headers(init.headers)) : {};
  return {
    ...init,
    headers: new Headers({
      "content-type": contentType,
      "x-content-type-options": NOSNIFF,
      ...existing,
    }),
  };
}

/**
 * Build a {@link RequestContext} for a single request. The returned
 * object is safe to use inside a route handler.
 *
 * `shellInfo` is closure-captured by `createApp` so `render` knows
 * the runtime / stylesheet paths. When it is `null`, `render` is
 * identical to `html`.
 */
export function buildRequestContext(
  options: BuildRequestContextOptions,
): RequestContext {
  const locals = options.locals ?? new Map<string, unknown>();
  const params = options.params;
  const request = options.request;
  const url = options.url;
  const shellInfo = options.shellInfo ?? null;

  const html = (value: Renderable | Response, init?: ResponseInit): Response => {
    if (value instanceof Response) {
      return value;
    }
    // Hono's `JSXNode` has a useful `toString()`. `String(value)`
    // works for strings, numbers, booleans, and `null`. For
    // `HtmlEscapedString` and `JSXNode`, the call dispatches to
    // `toString()`. `undefined` is coerced to `""` so the response
    // body is an empty string (not the literal `"undefined"`);
    // the status is still 200.
    const body = value === undefined
      ? ""
      : value === null
      ? String(value)
      : typeof value === "string"
      ? value
      : String(value);
    return new Response(body, withSecurityHeaders(init, "text/html; charset=utf-8"));
  };

  const json = <T>(value: T, init?: ResponseInit): Response => {
    // `JSON.stringify(undefined)` returns `undefined`, which produces
    // an empty body. Coerce to `null` so the body is `"null"` — the
    // JS-spec-faithful behaviour and a safe non-breaking change.
    const text = JSON.stringify(value === undefined ? null : value);
    return new Response(text, withSecurityHeaders(init, "application/json; charset=utf-8"));
  };

  const text = (value: string, init?: ResponseInit): Response => {
    return new Response(value, withSecurityHeaders(init, "text/plain; charset=utf-8"));
  };

  const redirect = (
    location: string,
    status: 301 | 302 | 303 | 307 | 308 = 302,
  ): Response => {
    if (typeof location !== "string" || location.length === 0) {
      return new Response("Bad Request: missing redirect location", {
        status: 400,
        headers: {
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": NOSNIFF,
        },
      });
    }
    return new Response(null, {
      status,
      headers: {
        "location": location,
        "x-content-type-options": NOSNIFF,
      },
    });
  };

  const render = (
    value: Renderable | Response,
    init?: ResponseInit,
  ): Response | Promise<Response> => {
    if (value instanceof Response) {
      return value;
    }
    if (shellInfo === null) {
      return html(value, init);
    }
    // Delegate to wrapHtml so the HTML-shell construction is in one place.
    return wrapHtml(value, shellInfo, init);
  };

  return {
    request,
    url,
    params,
    locals,
    html,
    json,
    text,
    redirect,
    render,
  };
}
