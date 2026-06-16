// Canonical Hono import map and version for coordination across the workspace.
//
// This file is NOT executed at runtime. It is a documentation and
// coordination helper: `deno task check-hono-sync` reads each workspace
// file and asserts the Hono import lines match what this module exports.
//
// When bumping Hono, update this file and re-run the sync check to
// identify every file that needs updating.
export const HONO_VERSION = "4.12.24";

export const HONO_IMPORTS = {
  "@hono/hono": `jsr:@hono/hono@${HONO_VERSION}`,
  "@hono/hono/jsx": `jsr:@hono/hono@${HONO_VERSION}/jsx`,
  "@hono/hono/jsx/dom": `jsr:@hono/hono@${HONO_VERSION}/jsx/dom`,
  "@hono/hono/jsx/dom/jsx-runtime": `jsr:@hono/hono@${HONO_VERSION}/jsx/dom/jsx-runtime`,
  "@hono/hono/html": `jsr:@hono/hono@${HONO_VERSION}/html`,
} as const;
