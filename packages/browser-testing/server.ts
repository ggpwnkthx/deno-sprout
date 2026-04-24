/** Server lifecycle helpers for browser tests. */

import { createDevServer } from "@ggpwnkthx/sprout-dev/server";
import { watcherMap } from "@ggpwnkthx/sprout-dev/server";
import { clearClients } from "@ggpwnkthx/sprout-dev/hmr";
import { clearBundlerCache } from "@ggpwnkthx/sprout-dev/lib/bundler";
import type { ServerContext } from "./types.ts";

type DevServerApp = Awaited<ReturnType<typeof createDevServer>>;

function getBaseUrl(server: Deno.HttpServer): string {
  const addr = server.addr;

  if (addr.transport !== "tcp") {
    throw new Error(`Expected TCP server, got transport: ${addr.transport}`);
  }

  const hostname = addr.hostname === "0.0.0.0" ? "127.0.0.1" : addr.hostname;
  return `http://${hostname}:${addr.port}`;
}

function disposeApp(app: DevServerApp | null): void {
  clearClients();

  if (app !== null) {
    const watcher = watcherMap.get(app);
    if (watcher) {
      watcher.close();
      watcherMap.delete(app);
    }
  }

  clearBundlerCache();
}

export async function startServer(root: string): Promise<ServerContext> {
  const app = await createDevServer({ root });
  const abortController = new AbortController();

  let markListening!: () => void;
  const listening = new Promise<void>((resolve) => {
    markListening = resolve;
  });

  try {
    const server = Deno.serve(
      {
        hostname: "127.0.0.1",
        port: 0,
        signal: abortController.signal,
        onListen() {
          markListening();
        },
      },
      app.fetch,
    );

    await listening;

    return {
      app,
      server,
      abortController,
      baseUrl: getBaseUrl(server),
    };
  } catch (error) {
    disposeApp(app);
    throw error;
  }
}

export async function stopServer(context: ServerContext): Promise<void> {
  try {
    context.abortController.abort();
    await context.server.finished;
  } finally {
    disposeApp(context.app);
  }
}
