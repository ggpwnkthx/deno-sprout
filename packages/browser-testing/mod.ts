/**
 * @ggpwnkthx/sprout-browser-testing
 *
 * Shared browser testing utilities for sprout packages.
 * Provides helpers for launching browsers, managing dev servers,
 * capturing page snapshots, and interacting with islands.
 */

export { closeQuietly } from "./close.ts";
export { collectAstralFailureDetails } from "./failure_collection.ts";
export { capture, toErrorMessage, trimPreview } from "./error.ts";
export {
  COUNTER_VALUE_SELECTOR,
  counterValueSelector,
  cssEscape,
  DATA_HYDRATED_ATTR,
  islandSelector,
} from "./selectors.ts";
export {
  formatNetworkStat,
  readBasicPageSnapshot,
  readIslandSnapshot,
  readModuleScripts,
  readNetworkStats,
} from "./page_snapshots.ts";
export {
  click,
  countElements,
  getAttribute,
  getInteractiveCounterValue,
  getTextContent,
} from "./page_interactions.ts";
export {
  installBrowserDiagnostics,
  readBrowserDiagnostics,
} from "./browser_instrumentation.ts";
export {
  waitForInteractiveCounterValue,
  waitForIslandHydration,
} from "./wait_hydration.ts";
export { startServer, stopServer } from "./server.ts";
export { withBrowserPage } from "./browser.ts";
export type {
  BasicPageSnapshot,
  BrowserInstance,
  BrowserIslandError,
  BrowserPageOptions,
  BrowserRuntimeDiagnostics,
  CaptureResult,
  ConsoleMessage,
  IslandInfo,
  IslandSnapshot,
  NetworkResourceDetails,
  ServerContext,
} from "./types.ts";
export {
  BODY_TEXT_PREVIEW_LENGTH,
  BROWSER_LAUNCH_TIMEOUT_MS,
  DEFAULT_WAIT_TIMEOUT_MS,
  FIXTURE_ROOT,
  HTML_PREVIEW_LENGTH,
  MAX_HTML_ARTIFACT_BYTES,
  RESOURCE_PREVIEW_LIMIT,
  SCRIPT_PREVIEW_LIMIT,
} from "./constants.ts";
