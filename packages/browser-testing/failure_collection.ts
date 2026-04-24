/** Astral failure detail aggregation for browser tests. */

import type { Page } from "@astral/astral";
import { capture } from "./error.ts";
import { trimPreview } from "./error.ts";
import { readBasicPageSnapshot } from "./page_snapshots.ts";
import { readIslandSnapshot } from "./page_snapshots.ts";
import { readBrowserDiagnostics } from "./browser_instrumentation.ts";
import { readNetworkStats } from "./page_snapshots.ts";
import { readModuleScripts } from "./page_snapshots.ts";
import { formatNetworkStat } from "./page_snapshots.ts";
import {
  BODY_TEXT_PREVIEW_LENGTH,
  HTML_PREVIEW_LENGTH,
  MAX_HTML_ARTIFACT_BYTES,
} from "./constants.ts";

export async function collectAstralFailureDetails(
  page: Page,
): Promise<string> {
  const lines = [`Astral diagnostics:`, `- page.url: ${page.url}`];

  const htmlResult = await capture(() => page.content());
  if (htmlResult.ok) {
    let htmlContent = htmlResult.value;
    if (htmlContent.length > MAX_HTML_ARTIFACT_BYTES) {
      htmlContent = htmlContent.slice(0, MAX_HTML_ARTIFACT_BYTES);
      lines.push(
        `- html: (truncated at ${MAX_HTML_ARTIFACT_BYTES} bytes — full content not written)`,
      );
    }
    lines.push(
      `- html preview: ${
        JSON.stringify(trimPreview(htmlResult.value, HTML_PREVIEW_LENGTH))
      }`,
    );
  } else {
    lines.push(`- html failed: ${htmlResult.error}`);
  }

  const basicSnapshotResult = await capture(() => readBasicPageSnapshot(page));
  if (basicSnapshotResult.ok) {
    const snapshot = basicSnapshotResult.value;
    lines.push(`- document.location: ${snapshot.locationHref}`);
    lines.push(`- document.title: ${JSON.stringify(snapshot.title)}`);
    lines.push(`- document.readyState: ${snapshot.readyState}`);
    lines.push(
      `- body text preview: ${
        JSON.stringify(
          trimPreview(snapshot.bodyTextPreview, BODY_TEXT_PREVIEW_LENGTH),
        )
      }`,
    );
  } else {
    lines.push(`- basic page snapshot failed: ${basicSnapshotResult.error}`);
  }

  const islandSnapshotResult = await capture(() => readIslandSnapshot(page));
  if (islandSnapshotResult.ok) {
    const snapshot = islandSnapshotResult.value;
    lines.push(`- [data-island] count: ${snapshot.islandCount}`);
    for (const island of snapshot.islands) {
      lines.push(
        `  [${island.name}] hydrated=${island.hydrated ?? "(none)"}`,
      );
      if (island.outerHtml !== null) {
        lines.push(
          `    HTML: ${trimPreview(island.outerHtml, HTML_PREVIEW_LENGTH)}`,
        );
      }
    }
  } else {
    lines.push(`- island snapshot failed: ${islandSnapshotResult.error}`);
  }

  const browserDiagnosticsResult = await capture(() =>
    readBrowserDiagnostics(page)
  );
  if (browserDiagnosticsResult.ok && browserDiagnosticsResult.value !== null) {
    const diag = browserDiagnosticsResult.value;

    // Island errors
    if (diag.islandErrors.length > 0) {
      lines.push(`- island errors:`);
      for (const err of diag.islandErrors) {
        lines.push(`    [${err.island}] ${err.name}: ${err.message}`);
      }
    }

    // Console messages
    if (diag.consoleMessages.length > 0) {
      lines.push(`- console messages:`);
      const byType: Record<string, string[]> = {};
      for (const msg of diag.consoleMessages) {
        if (!byType[msg.type]) byType[msg.type] = [];
        byType[msg.type].push(msg.message);
      }
      for (const [type, messages] of Object.entries(byType)) {
        lines.push(`    ${type} (${messages.length}):`);
        for (const msg of messages.slice(0, 20)) {
          lines.push(
            `      ${msg.length > 200 ? `${msg.slice(0, 200)}…` : msg}`,
          );
        }
        if (messages.length > 20) {
          lines.push(`      … and ${messages.length - 20} more`);
        }
      }
    }

    // Resource errors
    if (diag.resourceErrors.length > 0) {
      lines.push(`- resource errors: ${diag.resourceErrors.join("; ")}`);
    }

    // Hydrated events
    if (diag.hydratedEvents.length > 0) {
      lines.push(`- hydrated islands: ${diag.hydratedEvents.join(", ")}`);
    }
  } else if (!browserDiagnosticsResult.ok) {
    lines.push(
      `- sprout diagnostics failed: ${browserDiagnosticsResult.error}`,
    );
  }

  const networkStatsResult = await capture(() => readNetworkStats(page));
  if (networkStatsResult.ok && networkStatsResult.value.length > 0) {
    lines.push(`- network resources:`);
    for (const stat of networkStatsResult.value) {
      lines.push(formatNetworkStat(stat));
    }
  }

  const scriptsResult = await capture(() => readModuleScripts(page));
  if (scriptsResult.ok) {
    lines.push(
      `- scripts: ${
        scriptsResult.value.length === 0
          ? "(none)"
          : scriptsResult.value.join(", ")
      }`,
    );
  } else {
    lines.push(`- scripts failed: ${scriptsResult.error}`);
  }

  return lines.join("\n");
}
