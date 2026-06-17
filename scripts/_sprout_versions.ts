// Canonical list of Sprout workspace packages, keyed by package name
// (without the @sprout/ prefix), for version-consistency checks.

const ROOT = new URL("../", import.meta.url).pathname;

export interface SproutPackage {
  name: string;
  version: string;
}

// Walk packages/*/deno.jsonc and return a map of package name to version.
// Uses the name field as the source of truth (not the directory name).
export function getSproutPackages(): Record<string, SproutPackage> {
  const packages: Record<string, SproutPackage> = {};
  const entries = Deno.readDirSync(ROOT + "packages");
  for (const entry of entries) {
    if (!entry.isDirectory) continue;
    const configPath = ROOT + "packages/" + entry.name + "/deno.jsonc";
    let configText: string;
    try {
      configText = Deno.readTextFileSync(configPath);
    } catch {
      continue;
    }
    // Strip single-line comments (JSONC) before parsing
    const jsonText = configText
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n");
    let parsed: { name?: string; version?: string };
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      continue;
    }
    if (typeof parsed.name === "string" && typeof parsed.version === "string") {
      packages[parsed.name] = { name: parsed.name, version: parsed.version };
    }
  }
  return packages;
}
