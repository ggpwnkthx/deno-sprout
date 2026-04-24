/** Shared types for browser tests. */

import type { Page } from "@astral/astral";

export type BrowserInstance = Awaited<
  ReturnType<typeof import("@astral/astral").launch>
>;

export interface ServerContext {
  readonly app: Awaited<
    ReturnType<typeof import("@ggpwnkthx/sprout-dev").createDevServer>
  >;
  readonly server: Deno.HttpServer;
  readonly abortController: AbortController;
  readonly baseUrl: string;
}

export interface BrowserPageOptions {
  readonly name: string;
  readonly pathname: string;
  readonly assertPage: (page: Page) => Promise<void>;
}

export interface ConsoleMessage {
  readonly type: string;
  readonly message: string;
  readonly timestamp: number;
}

export interface NetworkResourceDetails {
  readonly name: string;
  readonly type: string;
  readonly status: number;
  readonly transferSize: number;
  readonly duration: number;
  readonly failed: boolean;
}

export interface BrowserRuntimeDiagnostics {
  islandErrors: readonly BrowserIslandError[];
  consoleMessages: readonly ConsoleMessage[];
  hydratedEvents: readonly string[];
  resourceErrors: readonly string[];
}

export interface BrowserIslandError {
  readonly island: string;
  readonly name: string;
  readonly message: string;
}

export interface BasicPageSnapshot {
  readonly locationHref: string;
  readonly title: string;
  readonly readyState: string;
  readonly bodyTextPreview: string;
}

export interface IslandSnapshot {
  readonly islandCount: number;
  readonly islands: readonly IslandInfo[];
}

export interface IslandInfo {
  readonly name: string;
  readonly hydrated: string | null;
  readonly outerHtml: string | null;
}

export type CaptureResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: string };
