// lib/bundler.ts - Bundler interface
export interface DevServerOptions {
  root?: string;
  port?: number;
}

export interface HMRClient {
  send: (message: unknown) => void;
}
