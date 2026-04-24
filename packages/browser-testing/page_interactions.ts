/** Page interaction helpers for browser tests. */

import type { Page } from "@astral/astral";
import { counterValueSelector } from "./selectors.ts";

export async function getTextContent(
  page: Page,
  selector: string,
): Promise<string> {
  return await page.evaluate(
    (sel: string) => document.querySelector(sel)?.textContent?.trim() ?? "",
    { args: [selector] },
  );
}

export async function getAttribute(
  page: Page,
  selector: string,
  attribute: string,
): Promise<string | null> {
  return await page.evaluate(
    (sel: string, attr: string) =>
      document.querySelector(sel)?.getAttribute(attr) ?? null,
    { args: [selector, attribute] },
  );
}

export async function countElements(
  page: Page,
  selector: string,
): Promise<number> {
  return await page.evaluate(
    (sel: string) => document.querySelectorAll(sel).length,
    { args: [selector] },
  );
}

export async function click(
  page: Page,
  selector: string,
): Promise<void> {
  const handle = await page.waitForSelector(selector);
  await handle.click();
}

export async function getInteractiveCounterValue(
  page: Page,
  islandName: string,
): Promise<number> {
  const selector = counterValueSelector(islandName);
  return await page.evaluate(
    (sel: string) => {
      const value = document.querySelector(sel)?.textContent?.trim() ?? "";
      return Number(value);
    },
    { args: [selector] },
  );
}
