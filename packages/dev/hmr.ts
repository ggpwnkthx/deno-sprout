// hmr.ts - Hot Module Replacement
import { defineWebSocketHelper } from "@hono/hono/ws";

export type HmrEventType = "reload" | "css-update" | "island-update";

export interface HmrEvent {
  type: HmrEventType;
  /** Path of the changed file, relative to project root. */
  path: string;
}

/** Maximum number of concurrent WebSocket HMR clients. */
const MAX_CLIENTS = 100;

/** WebSocket client contract. */
export interface HmrClient {
  send(msg: string): void;
  close(): void;
}

// Track connected WebSocket clients - module-level singleton
const clients = new Set<HmrClient>();

/** Clear all tracked WebSocket clients. Exported for use in tests. */
export function clearClients(): void {
  clients.clear();
}

/**
 * Start watching `dirs` with Deno.watchFs.
 * On each FS event, call `onEvent` with a classified HmrEvent.
 * Returns a handle to stop the watcher.
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
    // Check if directory exists - if not, skip it
    let exists = false;
    try {
      Deno.statSync(dir);
      exists = true;
    } catch {
      // Directory doesn't exist, skip
    }
    if (!exists) continue;

    const watcher = Deno.watchFs(dir, { recursive: true });
    watchers.push(watcher);

    (async () => {
      for await (const event of watcher) {
        if (event.paths.length === 0) continue;

        for (const path of event.paths) {
          const hmEvent = classifyFsEvent(event, dir);
          if (hmEvent) {
            debounce(path, () => onEvent(hmEvent));
          }
        }
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
 * Classify a Deno.FsEvent into an HmrEvent.
 *
 * Classification rules:
 *   *.css              → { type: "css-update", path }
 *   islands/*.tsx/.ts  → { type: "island-update", path }
 *   everything else    → { type: "reload", path }
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

  // Classify islands
  if (
    path.includes("/islands/") &&
    (path.endsWith(".tsx") || path.endsWith(".ts"))
  ) {
    return { type: "island-update", path };
  }

  // Everything else is a reload
  return { type: "reload", path };
}

/**
 * Create a Hono WebSocket handler for the /_sprout/hmr endpoint.
 * Connected clients are tracked in a Set.
 * Returns a broadcast function used by the watcher.
 */
export function createHmrHandler(): {
  handler: ReturnType<typeof defineWebSocketHelper>;
  broadcast: (event: HmrEvent) => void;
} {
  // Handler for the WebSocket upgrade
  const wsHandler = defineWebSocketHelper((_c, events) => {
    if (clients.size >= MAX_CLIENTS) {
      return new Response("Service Unavailable", { status: 503 });
    }
    clients.add(events as unknown as HmrClient);

    return new Response(null, { status: 101 }); // Switching Protocols
  });

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

  return { handler: wsHandler, broadcast };
}
