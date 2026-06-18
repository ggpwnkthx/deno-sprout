// Fixture: a `sprout.config.ts` that asks the build to write outside
// the project root. `loadConfig` must throw `CONFIG_PATH_OUTSIDE_ROOT`.
// `styles.app` is set to false so `loadConfig` does not try to
// resolve the default `src/styles/app.css` lookup in the fixture.
export default { outDir: "../outside", styles: { app: false } };
