// types.ts - Core type definitions
import type { Context } from "@hono/hono";
import type { Child } from "@hono/hono/jsx";

// ── Manifest types (Phase 1 Task 9) ──────────────────────────────────────────

export interface RouteManifestEntry {
  pattern: string;
  filePath: string;
  isApi: boolean;
  skipInheritedLayouts: boolean;
  routeOverride?: string;
  layoutChain: string[];
  middlewareChain: string[];
}

export interface RoutesManifest {
  routes: RouteManifestEntry[];
  builtAt: string;
  version: string;
}

// ── Route/layout config (original stub) ──────────────────────────────────────

export interface RouteConfig {
  routeOverride?: string;
  skipInheritedLayouts?: boolean;
}

export interface LayoutConfig {
  skipInheritedLayouts?: boolean;
}

// ── Page/component types (Phase 4 Task 2 cleanup) ────────────────────────────

export interface PageProps<TData = unknown> {
  data: TData;
  params: Record<string, string>;
  url: URL;
}

export type PageComponent<TData = unknown> = (
  props: PageProps<TData>,
) => Child;

export type LayoutComponent = (
  props: { children: Child },
) => Child;

export type Handler = (c: Context) => Response | Promise<Response>;

export type Handlers = Partial<
  Record<"GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD", Handler>
>;

export type DataLoader<TData = unknown> = (
  c: Context,
) => TData | Promise<TData | void> | void;

// ── Error/404 page props (Phase 4 Task 1) ────────────────────────────────────

export interface ErrorPageProps {
  error: Error;
  url: URL;
}

export interface NotFoundPageProps {
  url: URL;
}
