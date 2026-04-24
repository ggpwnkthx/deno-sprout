/** Browser launch and page helpers. */

import { launch } from "@astral/astral";
import type { Page } from "@astral/astral";
import { closeQuietly } from "./close.ts";
import { startServer, stopServer } from "./server.ts";
import { installBrowserDiagnostics } from "./browser_instrumentation.ts";
import { collectAstralFailureDetails } from "./failure_collection.ts";
import { toErrorMessage } from "./error.ts";
import type { BrowserInstance } from "./types.ts";
import { BROWSER_LAUNCH_TIMEOUT_MS, FIXTURE_ROOT } from "./constants.ts";

async function launchBrowser(options: {
  readonly args?: string[];
}): Promise<BrowserInstance> {
  let timeoutId: number | undefined;

  const launchPromise = launch(options);
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(
      () => reject(new Error("Browser launch timed out after 30 seconds")),
      BROWSER_LAUNCH_TIMEOUT_MS,
    );
  });

  try {
    return await Promise.race([launchPromise, timeoutPromise]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

export interface WithBrowserPageOptions {
  /**
   * Human-readable name for this test, used in failure output.
   */
  readonly name: string;
  readonly pathname: string;
  readonly assertPage: (page: Page) => Promise<void>;
  /**
   * Custom browser launch arguments appended to defaults.
   * @example ["--no-sandbox"] for CI environments
   */
  readonly launchArgs?: readonly string[];
  /**
   * Custom fixture root directory. Defaults to FIXTURE_ROOT constant.
   */
  readonly fixtureRoot?: string;
  /**
   * Custom wait strategy before running assertions.
   * - "load": wait for page load event (fires when all resources loaded)
   * - "networkidle": wait for network idle (default, but can be flaky with HMR)
   * - "none": no automatic wait
   */
  readonly waitStrategy?: "load" | "networkidle" | "none";
}

export async function withBrowserPage(
  options: WithBrowserPageOptions,
): Promise<void> {
  if (!options.pathname.startsWith("/")) {
    throw new Error(
      `pathname must start with "/", got ${JSON.stringify(options.pathname)}`,
    );
  }
  const fixtureRoot = options.fixtureRoot ?? FIXTURE_ROOT;
  const waitStrategy = options.waitStrategy ?? "networkidle";
  const serverContext = await startServer(fixtureRoot);
  let browser: BrowserInstance | null = null;
  let page: Page | null = null;

  try {
    browser = await launchBrowser({
      args: ["--no-sandbox", ...options.launchArgs ?? []],
    });
    // Create blank page and install diagnostics BEFORE navigation
    // to capture early console errors, hydration failures, and script errors
    const p = await browser.newPage();
    page = p;
    await installBrowserDiagnostics(p);
    // Now navigate to the actual page
    await p.goto(`${serverContext.baseUrl}${options.pathname}`);
    // Apply wait strategy
    if (waitStrategy === "networkidle") {
      await p.waitForNetworkIdle();
    } else if (waitStrategy === "load") {
      await p.waitForNavigation({ waitUntil: "load" });
    }
    // If waitStrategy is "none", caller is responsible for any needed waits
    await options.assertPage(p);
  } catch (error) {
    if (page !== null) {
      const details = await collectAstralFailureDetails(page);
      throw new Error(`${toErrorMessage(error)}\n\n${details}`);
    }

    throw error;
  } finally {
    await closeQuietly(page);
    await closeQuietly(browser);
    await stopServer(serverContext);
  }
}
