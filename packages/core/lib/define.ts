// lib/define.ts - Helper exports for routes
import type {
  DataLoader,
  Handler,
  Handlers,
  LayoutComponent,
  PageComponent,
} from "../types.ts";
import type { MiddlewareHandler } from "../context.ts";

/**
 * Type-narrowing helpers for route files.
 *
 * All functions in this module are **identity functions at runtime** — they
 * return their input unchanged. The type narrowing is purely for the
 * TypeScript compiler and does not perform any validation or transformation.
 *
 * These helpers serve as documentation markers in route files, making it
 * explicit which exports are pages, loaders, handlers, etc.
 *
 * @example Basic page definition
 * ```tsx
 * const page = define.page<{ title: string }>(function BlogPost({ data }) {
 *   return <h1>{data.title}</h1>;
 * });
 * export { page };
 * ```
 *
 * @example Single-handler shorthand (GET by default)
 * ```tsx
 * export const handlers = define.handlers(async (c) => {
 *   return c.json({ ok: true });
 * });
 * ```
 *
 * @example Explicit method map
 * ```tsx
 * export const handlers = define.handlers({
 *   GET: async (c) => c.text("hello"),
 *   POST: async (c) => { await save(c); return c.text("saved", 201); },
 * });
 * ```
 *
 * @example Layout with marker
 * ```tsx
 * const layout = define.layout(function MyLayout({ children }) {
 *   return <div class="wrapper">{children}</div>;
 * });
 * export { layout };
 * ```
 */

interface DefineExports {
  /** Type-narrow a page component. */
  page<TData = unknown>(component: PageComponent<TData>): PageComponent<TData>;
  /** Type-narrow a data loader. */
  loader<TData = unknown>(loader: DataLoader<TData>): DataLoader<TData>;
  /** Type-narrow HTTP method handlers. Accepts a single function (mapped to GET). */
  handlers(handlers: Handlers | Handler): Handlers;
  /** Type-narrow a layout component. */
  layout(component: LayoutComponent): LayoutComponent;
  /** Type-narrow a middleware handler. */
  middleware(handler: MiddlewareHandler): MiddlewareHandler;
}

export const define: DefineExports = {
  // All methods below are identity functions — they exist for type narrowing
  // and documentation clarity, not runtime behavior. The TypeScript compiler
  // narrows the return type but Deno executes the original value unchanged.
  page<TData = unknown>(component: PageComponent<TData>): PageComponent<TData> {
    return component;
  },
  loader<TData = unknown>(loader: DataLoader<TData>): DataLoader<TData> {
    return loader;
  },
  handlers(handlers: Handlers | Handler): Handlers {
    if (typeof handlers === "function") {
      return { GET: handlers };
    }
    return handlers;
  },
  layout(component: LayoutComponent): LayoutComponent {
    return component;
  },
  middleware(handler: MiddlewareHandler): MiddlewareHandler {
    return handler;
  },
};

export type { DataLoader, Handler, Handlers, LayoutComponent, PageComponent };
