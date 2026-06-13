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
import type { RequestContext } from "./types.ts";
import { htmlShell } from "./html_shell.tsx";
import type { JSXNode } from "jsr:@hono/hono@4.12.24/jsx";

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
 * Merge `init.headers` (caller-supplied) with a framework default
 * `content-type`. Caller headers win on conflict so a route handler
 * can override the type (e.g. emit `text/csv`).
 */
function withContentType(
  init: ResponseInit | undefined,
  contentType: string,
): ResponseInit {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", contentType);
  }
  return { ...init, headers };
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

  const html = (value: unknown, init?: ResponseInit): Response => {
    if (value instanceof Response) {
      return value;
    }
    // Hono's `JSXNode` has a useful `toString()`. `String(value)`
    // works for strings, numbers, booleans, `null`, and
    // `undefined` (renders the literal text). For `HtmlEscapedString`
    // and `JSXNode`, the call dispatches to `toString()`.
    const body = value === null || value === undefined
      ? String(value)
      : typeof value === "string"
      ? value
      : String(value);
    return new Response(body, withContentType(init, "text/html; charset=utf-8"));
  };

  const json = (value: unknown, init?: ResponseInit): Response => {
    const text = JSON.stringify(value);
    return new Response(text, withContentType(init, "application/json; charset=utf-8"));
  };

  const text = (value: string, init?: ResponseInit): Response => {
    return new Response(value, withContentType(init, "text/plain; charset=utf-8"));
  };

  const redirect = (
    location: string,
    status: 301 | 302 | 303 | 307 | 308 = 302,
  ): Response => {
    if (typeof location !== "string" || location.length === 0) {
      return new Response("Bad Request: missing redirect location", {
        status: 400,
        headers: { "content-type": "text/plain; charset=utf-8" },
      });
    }
    return new Response(null, {
      status,
      headers: { "location": location },
    });
  };

  const render = (
    value: unknown,
    init?: ResponseInit,
  ): Response | Promise<Response> => {
    if (value instanceof Response) {
      return value;
    }
    if (shellInfo === null) {
      return html(value, init);
    }
    const title = extractTitle(init?.headers);
    const body: JSXNode = htmlShell({
      title,
      body: value,
      stylesheetPublicPath: shellInfo.stylesheetPublicPath,
      runtimePublicPath: shellInfo.runtimePublicPath,
    });
    return new Response(String(body), withContentType(init, "text/html; charset=utf-8"));
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

/**
 * Look for an `X-Sprout-Title` header on the init headers and use it
 * as the page title. The header is a M3-only convenience; future
 * milestones may add a real `<Head>` injection API.
 */
function extractTitle(headers: HeadersInit | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }
  const h = new Headers(headers);
  const value = h.get("X-Sprout-Title");
  return value ?? undefined;
}
