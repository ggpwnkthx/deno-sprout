// lib/define.ts - Helper exports for routes
import type {
  DataLoader,
  Handler,
  Handlers,
  LayoutComponent,
  PageComponent,
} from "../types.ts";

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
