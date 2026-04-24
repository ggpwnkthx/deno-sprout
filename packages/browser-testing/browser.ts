/** Browser launch and page helpers. */

import { launch } from "@astral/astral";
import type { Page } from "@astral/astral";
import { closeQuietly } from "./close.ts";
import { startServer, stopServer } from "./server.ts";
import { installBrowserDiagnostics } from "./browser_instrumentation.ts";
import { collectAstralFailureDetails } from "./failure_collection.ts";
import { toErrorMessage } from "./error.ts";
import type { BrowserInstance } from "./types.ts";
import type { BrowserPageOptions } from "./types.ts";
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

export async function withBrowserPage(
  options: BrowserPageOptions,
): Promise<void> {
  const serverContext = await startServer(FIXTURE_ROOT);
  let browser: BrowserInstance | null = null;
  let page: Page | null = null;

  try {
    browser = await launchBrowser({ args: ["--no-sandbox"] });
    const p = await browser.newPage(
      `${serverContext.baseUrl}${options.pathname}`,
    );
    page = p;
    await installBrowserDiagnostics(p);
    await p.waitForNetworkIdle();
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
