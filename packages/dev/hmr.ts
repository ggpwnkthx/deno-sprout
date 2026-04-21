/**
 * Hot Module Replacement (HMR) system for Sprout development.
 *
 * Monitors filesystem changes and broadcasts events to connected browser
 * clients over a WebSocket connection. Enables fast iteration by applying
 * CSS updates without full reload and triggering page reloads for other changes.
 *
 * @module
 */
import { defineWebSocketHelper } from "@hono/hono/ws";

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
 * This is a stable local interface that does not depend on `@hono/hono/ws`
 * internals. It describes what `createHmrHandler` returns — a callable that
 * Hono can register as a WebSocket route handler.
 *
 * The `handler` field is compatible with Hono's `app.get(path, handler)` when
 * cast through `MiddlewareHandler` at the registration site.
 */
export interface HmrWsHandler {
  (
    c: { res: { status: number; headers: Headers } },
    events: unknown,
  ): Promise<Response | void>;
}

// Track connected WebSocket clients - module-level singleton
const clients = new Set<HmrClient>();

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
      for (const timer of debounceTimers.values()) {
        clearTimeout(timer);
      }
      debounceTimers.clear();
      for (const watcher of watchers) {
        watcher.close();
      }
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
 * The `projectRoot` parameter is currently unused but reserved for future
 * relative-path normalisation.
 *
 * @param fsEvent - Raw filesystem event from `Deno.watchFs`.
 * @param projectRoot - Absolute path of the project root (unused, for future use).
 * @returns An `HmrEvent` describing the change, or `null` if the event had no paths.
 */
export function classifyFsEvent(
  fsEvent: Deno.FsEvent,
  _projectRoot: string,
): HmrEvent | null {
  // Get the first path from the event
  const path = fsEvent.paths[0];
  if (!path) return null;

  // Classify by file extension
  if (path.endsWith(".css")) {
    return { type: "css-update", path };
  }

  // Classify islands — check for "islands" as a path segment boundary.
  // Using split prevents false positives from paths like "/not-islands/foo/islands/bar.tsx".
  const segments = path.split("/");
  if (
    segments.includes("islands") &&
    (path.endsWith(".tsx") || path.endsWith(".ts"))
  ) {
    return { type: "island-update", path };
  }

  // Everything else is a reload
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
 * `defineWebSocketHelper`.
 *
 * @returns An object containing:
 *   - `handler` — Hono WebSocket handler to register on the HMR route.
 *   - `broadcast(event)` — call this to send an event to all connected clients.
 */
export function createHmrHandler(): {
  handler: HmrWsHandler;
  broadcast: (event: HmrEvent) => void;
} {
  // defineWebSocketHelper wraps the callback to produce a Hono WebSocketHandler.
  // The returned value is what Hono's WebSocket upgrade mechanism expects;
  // we cast it to HmrWsHandler via `unknown` at the registration site.
  const rawHandler = defineWebSocketHelper((_c, events) => {
    if (clients.size >= MAX_CLIENTS) {
      return new Response("Service Unavailable", { status: 503 });
    }
    // SAFETY: `events` is the WebSocket object passed by defineWebSocketHelper.
    // HmrClient requires only { send, close }, both supported by the Hono WS
    // object, so the cast through `unknown` is safe.
    clients.add(events as unknown as HmrClient);

    return new Response(null, { status: 101 }); // Switching Protocols
  });

  // The wrapper returns a WebSocketHandler (AsyncHandler) — the actual type
  // is inferred from defineWebSocketHelper internals. We expose HmrWsHandler
  // as the stable public shape and cast through unknown at the call site.
  const handler: HmrWsHandler = rawHandler as unknown as HmrWsHandler;

  function broadcast(event: HmrEvent) {
    const message = JSON.stringify(event);
    for (const client of clients) {
      try {
        client.send(message);
      } catch {
        // Any error on send indicates the client is gone — remove it and continue.
        // This is the correct behavior for WebSocket disconnect (DOMException with
        // INVALID_STATE_ERR / code 1006) and for test mocks that throw plain Error.
        clients.delete(client);
      }
    }
  }

  return { handler, broadcast };
}
