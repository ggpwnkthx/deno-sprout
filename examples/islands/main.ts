import { createApp } from "@ggpwnkthx/sprout";
const app = await createApp();
Deno.serve(app.fetch);
