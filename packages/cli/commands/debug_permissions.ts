// The per-command permission requirements block printed by
// `sprout help --debug` and embedded in M5 README / docs. Lives in
// its own module so the help text and the test fixtures share a
// single source of truth.

/** Print the four command-→-permission rows to `out`. */
export function printDebugPermissionNote(out: (line: string) => void): void {
  out("  init:   --allow-read --allow-write");
  out("  dev:    --allow-read --allow-write --allow-env --allow-net --allow-run");
  out("  build:  --allow-read --allow-write --allow-env --allow-net --allow-run");
  out("  serve:  --allow-read --allow-env --allow-net");
}
