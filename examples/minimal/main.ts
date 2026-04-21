import { createApp } from "@ggpwnkthx/sprout";
const app = await createApp();
Deno.serve(app.fetch);

// See routes/_404.tsx and routes/_error.tsx for custom error pages.
