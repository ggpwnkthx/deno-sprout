/** Island hydration wait utilities for browser tests. */

import type { Page } from "@astral/astral";
import { assertEquals } from "@std/assert";
import { counterValueSelector, cssEscape } from "./selectors.ts";
import { getAttribute } from "./page_interactions.ts";
import { getInteractiveCounterValue } from "./page_interactions.ts";
import { DEFAULT_WAIT_TIMEOUT_MS } from "./constants.ts";

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: number | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  });
}

export async function waitForIslandHydration(
  page: Page,
  islandName: string,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
): Promise<void> {
  const selector = `[data-island='${cssEscape(islandName)}']`;

  await page.waitForSelector(selector);

  try {
    await withTimeout(
      page.waitForFunction(
        (sel: string) =>
          document.querySelector(sel)?.getAttribute("data-hydrated") === "true",
        { args: [selector] },
      ),
      timeoutMs,
      `Timed out waiting for ${islandName} hydration`,
    );
  } catch {
    const actual = await getAttribute(page, selector, "data-hydrated");

    assertEquals(
      actual,
      "true",
      `Timed out waiting for ${islandName} hydration, got data-hydrated=${
        JSON.stringify(actual)
      }`,
    );
  }
}

export async function waitForInteractiveCounterValue(
  page: Page,
  islandName: string,
  expected: number,
  timeoutMs = DEFAULT_WAIT_TIMEOUT_MS,
): Promise<void> {
  const selector = counterValueSelector(islandName);
  try {
    await withTimeout(
      page.waitForFunction(
        (sel: string, expectedValue: number) => {
          const value = document.querySelector(sel)?.textContent?.trim() ?? "";
          return Number(value) === expectedValue;
        },
        { args: [selector, expected] },
      ),
      timeoutMs,
      `Timed out waiting for InteractiveCounter to reach ${expected}`,
    );
  } catch {
    const actual = await getInteractiveCounterValue(page, islandName);

    assertEquals(
      actual,
      expected,
      `Timed out waiting for InteractiveCounter to reach ${expected}, got ${actual}`,
    );
  }
}
