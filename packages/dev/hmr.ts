/**
 * Hot Module Replacement (HMR) system for Sprout development.
 *
 * Monitors filesystem changes and broadcasts events to connected browser
 * clients over a WebSocket connection. Enables fast iteration by applying
 * CSS updates without full reload and triggering page reloads for other changes.
 *
 * @module
 */
import { upgradeWebSocket } from "@hono/hono/deno";

/**
 * The kind of HMR event emitted when a file changes.
 *
 * - `"reload"` — any other file changed; browser should do a full reload.
 * - `"css-update"` — a `.css` file changed; styles can be hot-updated.
 * - `"island-update"` — an island component changed; island cache should be busted.
 */
export type HmrEventType = "reload" | "css-update" | "island-update";

/**
 * An event emitted by the HMR system when a watched file changes.
 *
 * @property type - The kind of change. Controls what the browser does in response.
 * @property path - Absolute path of the changed file.
 */
export interface HmrEvent {
  type: HmrEventType;
  /** Absolute path of the changed file. */
  path: string;
}

/** Maximum number of concurrent WebSocket HMR clients. */
const MAX_CLIENTS = 100;

/**
 * Contract for a WebSocket client used by the HMR broadcast system.
 *
 * This interface abstracts over real `WebSocket` instances (used in the browser)
 * and test mocks so the HMR module has no hard dependency on browser APIs.
 */
export interface HmrClient {
  send(msg: string): void;
  close(): void;
}

/**
 * Contract for the HMR WebSocket handler returned by `createHmrHandler`.
 *
 * This is a stable local interface that does not depend on Hono internals.
 * It describes the handler returned by upgradeWebSocket from jsr:@hono/hono/deno,
 * compatible with Hono's app.get() registration.
 */
export interface HmrWsHandler {
  (c: {
    req: { header: (name: string) => string | undefined };
  }, events: unknown): Promise<unknown>;
}

// Track connected WebSocket clients - module-level singleton
// Exported for use in tests to directly manipulate the client set.
export const clients: Set<HmrClient> = new Set<HmrClient>();

/** Clear all tracked WebSocket clients. Exported for use in tests. */
export function clearClients(): void {
  clients.clear();
}

/**
 * Start watching one or more directories for filesystem events.
 *
 * Each filesystem change is classified via `classifyFsEvent` and emitted
 * via `onEvent`. Changes to the same path are debounced (50 ms) to avoid
 * rapid bursts during bulk saves.
 *
 * **Important:** Call the returned `close()` function when done to stop
 * all watchers and clear debounce timers. Leaving watchers open will
 * prevent the Deno process from exiting normally.
 *
 * @param dirs - Absolute paths of directories to watch recursively.
 * @param onEvent - Callback invoked for each classified HMR event.
 * @returns A handle with a `close()` method to stop all watchers.
 *
 * @example
 * ```ts
 * const { close } = watchFiles(["./islands", "./routes"], (event) => {
 *   console.log(`[HMR] ${event.type}: ${event.path}`);
 * });
 *
 * // Later, when done:
 * close();
 * ```
 */
export function watchFiles(
  dirs: string[],
  onEvent: (event: HmrEvent) => void,
): { close(): void } {
  const debounceTimers = new Map<string, number>();

  const debounce = (path: string, fn: () => void) => {
    const existing = debounceTimers.get(path);
    if (existing) {
      clearTimeout(existing);
    }
    const timer = setTimeout(() => {
      debounceTimers.delete(path);
      fn();
    }, 50);
    debounceTimers.set(path, timer);
  };

  const watchers: Deno.FsWatcher[] = [];

  for (const dir of dirs) {
    // Warn and skip if the directory does not exist at startup.
    // This surfaces misconfiguration (e.g. a typo in the path) immediately
    // rather than silently failing to watch.
    let exists = false;
    try {
      Deno.statSync(dir);
      exists = true;
    } catch {
      console.warn(`[HMR] watchFiles: directory not found, skipping: ${dir}`);
    }
    if (!exists) continue;

    const watcher = Deno.watchFs(dir, { recursive: true });
    watchers.push(watcher);

    // The watcher iterator can throw if the watched directory is deleted or
    // if OS limits are hit. A .catch() ensures the error is visible rather
    // than becoming an unhandled rejection.
    (async () => {
      try {
        for await (const event of watcher) {
          if (event.paths.length === 0) continue;

          for (const path of event.paths) {
            const hmEvent = classifyFsEvent(event, dir);
            if (hmEvent) {
              debounce(path, () => onEvent(hmEvent));
            }
          }
        }
      } catch (err) {
        console.error(`[HMR] watcher error on "${dir}":`, err);
      }
    })();
  }

  return {
    close() {
      // Close all watchers first. This causes the for-await loop to break,
      // discarding any in-flight events. Then cancel any pending debounce
      // timers so no queued callbacks fire after close().
      for (const watcher of watchers) {
        watcher.close();
      }
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
    },
  };
}

/**
 * Classify a raw `Deno.FsEvent` into an HmrEvent.
 *
 * Classification rules:
 * - `*.css` files &rarr; `type: "css-update"`
 * - `islands/*.tsx` or `islands/*.ts` &rarr; `type: "island-update"`
 * - Everything else &rarr; `type: "reload"`
 *
 * @param fsEvent - Raw filesystem event from `Deno.watchFs`.
 * @param _projectRoot - Absolute path of the project root (unused, for future use).
 * @returns An `HmrEvent` describing the change, or `null` if the event had no paths.
 */
export function classifyFsEvent(
  fsEvent: Deno.FsEvent,
  _projectRoot: string,
): HmrEvent | null {
  const path = fsEvent.paths[0];
  if (!path) return null;

  // Bound path length to prevent oversized events from propagating to clients.
  if (path.length > 4096) {
    console.warn(
      `[HMR] classifyFsEvent: path too long (${path.length}), skipping`,
    );
    return null;
  }

  if (path.endsWith(".css")) {
    return { type: "css-update", path };
  }

  const segments = path.split("/");
  if (
    segments.includes("islands") &&
    (path.endsWith(".tsx") || path.endsWith(".ts"))
  ) {
    return { type: "island-update", path };
  }

  return { type: "reload", path };
}

/**
 * Create a Hono WebSocket handler for the `/_sprout/hmr` endpoint.
 *
 * Up to `MAX_CLIENTS` (100) WebSocket clients are tracked in a module-level
 * set. The returned `broadcast()` function sends an event to every connected
 * client; clients that throw on send are removed automatically.
 *
 * The returned `handler` is registered on the `/_sprout/hmr` route via
 * `app.get()`. The `HmrWsHandler` interface describes the shape without
 * binding to Hono internals; at runtime the handler is produced by
 * `upgradeWebSocket`.
 *
 * @param options - Optional configuration.
 * @param options.clients - A `Set<HmrClient>` to use for tracking connections.
 *   Defaults to the module-level singleton. Pass a custom set to enable
 *   isolated unit testing without global state.
 * @returns An object containing:
 *   - `handler` — Hono WebSocket handler to register on the HMR route.
 *   - `broadcast(event)` — call this to send an event to all connected clients.
 */
export function createHmrHandler(options?: {
  clients?: Set<HmrClient>;
}): {
  handler: HmrWsHandler;
  broadcast: (event: HmrEvent) => void;
} {
  // Use provided clients set if given, otherwise fall back to the module singleton.
  // Passing a custom set enables isolated unit testing.
  const clientSet = options?.clients ?? clients;

  // upgradeWebSocket from @hono/hono/deno returns a handler compatible with app.get.
  // MAX_CLIENTS is enforced inside onOpen (post-upgrade) because Hono's
  // upgradeWebSocket factory does not support returning a Response from the
  // callback to reject the upgrade before it is established. When the limit is
  // exceeded, the client is closed immediately after connecting.
  const handler = upgradeWebSocket(() => {
    return {
      onOpen(_event, ws) {
        if (clientSet.size >= MAX_CLIENTS) {
          ws.close();
          return;
        }
        clientSet.add(ws as unknown as HmrClient);
      },
      onClose(ws) {
        clientSet.delete(ws as unknown as HmrClient);
      },
    };
  }) as HmrWsHandler;

  function broadcast(event: HmrEvent) {
    let message: string;
    try {
      message = JSON.stringify(event);
    } catch (err) {
      console.error("[HMR] broadcast: failed to serialize event:", err);
      return;
    }
    for (const client of clientSet) {
      try {
        client.send(message);
      } catch {
        // Client disconnected — remove silently. This is the expected path for
        // a dropped WebSocket connection (e.g., browser closed tab, network reset).
        clientSet.delete(client);
      }
    }
  }

  return { handler, broadcast };
}
