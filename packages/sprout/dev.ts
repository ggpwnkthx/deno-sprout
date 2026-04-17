// Executed by: deno task dev
// jsr:@ggpwnkthx/sprout/dev
import { createDevServer } from "@ggpwnkthx/sprout-dev/server";
const server = await createDevServer({ root: Deno.cwd() });
Deno.serve({ port: 8000 }, server.fetch);
