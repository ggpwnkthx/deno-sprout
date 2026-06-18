// Fixture: `about.tsx` and `about/index.tsx` both map to `/about`,
// which is a `DISCOVERY_ROUTE_CONFLICT`.
// `styles.app` is set to false so `loadConfig` does not try to
// resolve the default `src/styles/app.css` lookup in the fixture.
export default { root: ".", styles: { app: false } };
