// lib/define.ts - Helper exports for routes
import type {
  DataLoader,
  Handler,
  Handlers,
  LayoutComponent,
  PageComponent,
} from "../types.ts";

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
 * @example
 * // Identity at runtime — no wrapping or validation occurs:
 * const page = define.page(component);
 *
 * // Generic type parameter for documentation intent only:
 * const dataPage = define.page<{ slug: string }>(component);
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
  middleware(handler: Handler): Handler;
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
  middleware(handler: Handler): Handler {
    return handler;
  },
};

export type { DataLoader, Handler, Handlers, LayoutComponent, PageComponent };
