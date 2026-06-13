// HTML shell builder for `@sprout/core`.
//
// The shell is intentionally minimal: a doctype, a `<head>` with
// `<meta charset>` and (optionally) the app stylesheet link, the
// runtime script tag, and a `<body>` containing the user-rendered
// tree. The shell never includes `<meta name="viewport">` or any
// other opinionated meta; users can compose their own `<head>` via
// the M5 head injection API.
//
// The `body` argument is the user-rendered JSX tree. Hono's JSX
// runtime produces a `JSXNode` whose `toString()` emits the HTML;
// we forward the value through Hono's `jsx` factory so the runtime
// can apply island-placeholder interception at the shell level if
// the body contains registered islands.
//
// The doctype is emitted via Hono's `raw()` helper so it is written
// verbatim (no HTML escaping) at the start of the document.
import { Fragment, jsx } from "@sprout/jsx";
import { raw } from "jsr:@hono/hono@4.12.24/html";
import type { Child, JSXNode } from "jsr:@hono/hono@4.12.24/jsx";

/** Options accepted by {@link htmlShell}. */
export type HtmlShellOptions = {
  /** Optional `<title>` content. */
  readonly title?: string;
  /** The user-rendered JSX tree (or any renderable value). */
  readonly body: unknown;
  /** Stylesheet public path, or `null` to omit the link tag. */
  readonly stylesheetPublicPath: string | null;
  /** Runtime script public path. Always emitted. */
  readonly runtimePublicPath: string;
};

/**
 * Build the full HTML document for a route response.
 *
 * Layout:
 *
 * ```html
 * <!doctype html>
 * <html lang="en">
 *   <head>
 *     <meta charset="utf-8">
 *     <title>...</title>
 *     <link rel="stylesheet" href="...">     <!-- only when stylesheetPublicPath is non-null -->
 *     <script type="module" src="..."></script>
 *   </head>
 *   <body>...user tree...</body>
 * </html>
 * ```
 */
export function htmlShell(opts: HtmlShellOptions): JSXNode {
  const title = opts.title ?? "";
  const headChildren: Child[] = [
    jsx("meta", { charset: "utf-8" }),
    jsx("title", null, title),
  ];
  if (opts.stylesheetPublicPath !== null) {
    headChildren.push(
      jsx("link", { rel: "stylesheet", href: opts.stylesheetPublicPath }),
    );
  }
  headChildren.push(
    jsx("script", { type: "module", src: opts.runtimePublicPath }),
  );
  return jsx(
    Fragment,
    null,
    raw("<!doctype html>"),
    jsx(
      "html",
      { lang: "en" },
      jsx("head", null, ...headChildren),
      jsx("body", null, opts.body as Child),
    ),
  );
}
