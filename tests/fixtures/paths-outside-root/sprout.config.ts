// Fixture: a `sprout.config.ts` that asks the build to write outside
// the project root. `loadConfig` must throw `CONFIG_PATH_OUTSIDE_ROOT`.
export default { outDir: "../outside" };
