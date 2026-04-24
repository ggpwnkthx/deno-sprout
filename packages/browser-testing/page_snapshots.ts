/** Page snapshot readers for browser tests. */

import type { Page } from "@astral/astral";
import type {
  BasicPageSnapshot,
  IslandSnapshot,
  NetworkResourceDetails,
} from "./types.ts";
import {
  BODY_TEXT_PREVIEW_LENGTH,
  RESOURCE_PREVIEW_LIMIT,
} from "./constants.ts";

export async function readBasicPageSnapshot(
  page: Page,
): Promise<BasicPageSnapshot> {
  return await page.evaluate(
    (previewLength: number) => ({
      locationHref: globalThis.location.href,
      title: document.title,
      readyState: document.readyState,
      bodyTextPreview: document.body?.innerText?.slice(0, previewLength) ?? "",
    }),
    { args: [BODY_TEXT_PREVIEW_LENGTH] },
  );
}

export async function readIslandSnapshot(page: Page): Promise<IslandSnapshot> {
  return await page.evaluate(() => {
    const islands = Array.from(document.querySelectorAll("[data-island]"))
      .map((el) => ({
        name: el.getAttribute("data-island") ?? "unknown",
        hydrated: el.getAttribute("data-hydrated") ?? null,
        outerHtml: el.outerHTML,
      }));

    return {
      islandCount: islands.length,
      islands,
    };
  });
}

export async function readNetworkStats(
  page: Page,
): Promise<readonly NetworkResourceDetails[]> {
  return await page.evaluate(
    (limit: number) => {
      const entries = performance.getEntriesByType("resource")
        .slice(-limit) as PerformanceResourceTiming[];

      return entries.map((entry) => ({
        name: entry.name,
        type: entry.initiatorType,
        status:
          (entry as unknown as { responseStatus?: number }).responseStatus ?? 0,
        transferSize: entry.transferSize,
        duration: entry.duration,
        failed: entry.transferSize === 0 && entry.duration > 0,
      }));
    },
    { args: [RESOURCE_PREVIEW_LIMIT] },
  );
}

export async function readModuleScripts(
  page: Page,
): Promise<readonly string[]> {
  const SCRIPT_PREVIEW_LIMIT = 12;
  return await page.evaluate(
    (limit: number) =>
      Array.from(document.querySelectorAll("script"))
        .map((script) => {
          const src = script.getAttribute("src");
          return src && src.length > 0 ? src : "(inline)";
        })
        .slice(0, limit),
    { args: [SCRIPT_PREVIEW_LIMIT] },
  );
}

export function formatNetworkStat(stat: NetworkResourceDetails): string {
  const statusStr = stat.status > 0 ? `${stat.status}` : "no-response";
  const sizeStr = stat.transferSize > 0
    ? `${(stat.transferSize / 1024).toFixed(1)}KB`
    : "0KB";
  const failedStr = stat.failed ? " FAILED" : "";
  return `    [${stat.type}] ${stat.name} → ${statusStr} (${sizeStr}, ${
    stat.duration.toFixed(0)
  }ms)${failedStr}`;
}
