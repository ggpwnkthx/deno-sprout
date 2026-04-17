// lib/define.ts - Helper exports for routes
import type {
  Handler,
  Handlers,
  LayoutComponent,
  PageComponent,
} from "../types.ts";

interface DefineExports {
  page(component: PageComponent): PageComponent;
  handlers(handlers: Handlers | Handler): Handlers;
}

export const define: DefineExports = {
  page(component: PageComponent): PageComponent {
    return component;
  },
  handlers(handlers: Handlers | Handler): Handlers {
    if (typeof handlers === "function") {
      return { GET: handlers };
    }
    return handlers;
  },
};

export type { Handler, Handlers, LayoutComponent, PageComponent };
