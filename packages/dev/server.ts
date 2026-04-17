// server.ts - Development server
import type { DevServerOptions } from "./lib/bundler.ts";

export interface DevServer {
  start: () => void;
  stop: () => void;
}

export function createDevServer(_options?: DevServerOptions): DevServer {
  return {
    start: () => {
      console.log("Dev server starting...");
    },
    stop: () => {
      console.log("Dev server stopping...");
    },
  };
}
