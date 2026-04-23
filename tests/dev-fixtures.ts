/**
 * Dev server for manually checking test fixtures.
 *
 * Run with:
 *   deno run -A tests/dev-fixtures.ts
 *
 * Then visit http://localhost:8080
 */
import { createDevServer } from "@ggpwnkthx/sprout-dev/server";

const FIXTURES_ROOT = Deno.cwd() + "/tests/fixtures";

const server = await createDevServer({ root: FIXTURES_ROOT });
console.log("Fixture dev server running at http://localhost:8080");
Deno.serve({ port: 8080 }, server.fetch);
