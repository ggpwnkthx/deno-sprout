/** Browser instrumentation for capturing runtime diagnostics. */

import type { Page } from "@astral/astral";
import type { BrowserRuntimeDiagnostics } from "./types.ts";

const MAX_CONSOLE_MESSAGES = 500;
const MAX_MESSAGE_LENGTH = 2000;

export async function installBrowserDiagnostics(page: Page): Promise<void> {
  await page.evaluate(
    (maxMessages: number, maxMessageLength: number) => {
      type BrowserIslandError = {
        island: string;
        name: string;
        message: string;
      };

      type BrowserRuntimeDiagnostics = {
        islandErrors: BrowserIslandError[];
        consoleMessages: ConsoleMessage[];
        hydratedEvents: string[];
        resourceErrors: string[];
      };

      interface ConsoleMessage {
        type: string;
        message: string;
        timestamp: number;
      }

      const globalScope = globalThis as typeof globalThis & {
        __sproutTest?: BrowserRuntimeDiagnostics;
        __sproutOriginalConsole?: Partial<typeof console>;
        __sproutListenersInstalled?: boolean;
      };

      const safeStringify = (value: unknown, depth = 4): string => {
        if (typeof value === "string") {
          return value.slice(0, maxMessageLength);
        }

        try {
          // Depth-limited stringify to prevent event-loop stalls
          const seen = new WeakSet();
          let remainingDepth = depth;
          const result = JSON.stringify(value, (_k, v) => {
            if (remainingDepth <= 0) return "[max-depth]";
            remainingDepth--;
            if (typeof v === "object" && v !== null) {
              if (seen.has(v)) return "[circular]";
              seen.add(v);
            }
            return v;
          }, /* indent */ 2);
          return (result ?? Object.prototype.toString.call(value))
            .slice(0, maxMessageLength);
        } catch {
          return Object.prototype.toString.call(value).slice(
            0,
            maxMessageLength,
          );
        }
      };

      if (!globalScope.__sproutTest) {
        globalScope.__sproutTest = {
          islandErrors: [],
          consoleMessages: [],
          hydratedEvents: [],
          resourceErrors: [],
        };
      }

      const diagnostics = globalScope.__sproutTest;

      // Guard event listener registration to prevent accumulation on reused pages
      if (!globalScope.__sproutListenersInstalled) {
        document.addEventListener("island-error", (event) => {
          const customEvent = event as CustomEvent<{
            island?: string;
            error?: { name?: string; message?: string };
          }>;

          diagnostics.islandErrors.push({
            island: customEvent.detail?.island ?? "unknown",
            name: customEvent.detail?.error?.name ?? "Error",
            message: customEvent.detail?.error?.message ?? "unknown error",
          });
        });

        document.addEventListener("sprout:hydrated", (event) => {
          const target = event.target;
          const island = target instanceof Element
            ? target.getAttribute("data-island") ?? "unknown"
            : "unknown";

          diagnostics.hydratedEvents.push(island);
        });

        globalThis.addEventListener("error", (event) => {
          diagnostics.resourceErrors.push(event.message);
        });

        globalScope.__sproutListenersInstalled = true;
      }

      // Intercept all console methods with cap to prevent unbounded growth
      if (!globalScope.__sproutOriginalConsole) {
        globalScope.__sproutOriginalConsole = {};

        const consoleMethods = [
          "log",
          "warn",
          "info",
          "error",
          "debug",
        ] as const;
        for (const method of consoleMethods) {
          const original = console[method].bind(console);
          globalScope.__sproutOriginalConsole[method] = original;

          console[method] = (...args: unknown[]) => {
            if (diagnostics.consoleMessages.length < maxMessages) {
              diagnostics.consoleMessages.push({
                type: method,
                message: args.map(safeStringify).join(" "),
                timestamp: Date.now(),
              });
            }
            original(...args);
          };
        }
      }
    },
    { args: [MAX_CONSOLE_MESSAGES, MAX_MESSAGE_LENGTH] },
  );
}

export async function readBrowserDiagnostics(
  page: Page,
): Promise<BrowserRuntimeDiagnostics | null> {
  return await page.evaluate(() => {
    const globalScope = globalThis as typeof globalThis & {
      __sproutTest?: BrowserRuntimeDiagnostics;
    };

    return globalScope.__sproutTest ?? null;
  });
}
