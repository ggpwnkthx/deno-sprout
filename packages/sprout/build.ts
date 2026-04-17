// Executed by: deno task build
// jsr:@ggpwnkthx/sprout/build
import { buildIslands } from "@ggpwnkthx/sprout-build/bundler";
await buildIslands({ entryPoints: [], outdir: "./_dist" });
