// server.ts - Development server
import type { DevServerOptions } from "./lib/bundler.ts";

export interface DevServer {
  start: () => void;
  stop: () => void;
  fetch: (request: Request) => Response | Promise<Response>;
}

export function createDevServer(_options?: DevServerOptions): DevServer {
  return {
    start: () => {
      console.log("Dev server starting...");
    },
    stop: () => {
      console.log("Dev server stopping...");
    },
    fetch: (_request: Request) =>
      new Response("Not implemented", { status: 501 }),
  };
}
