// Check that all @sprout/* cross-package version pins are in sync.
//
// Usage: deno run --allow-read scripts/check_sprout_versions.ts
//
// Walks every packages/*/deno.jsonc and the CLI templates, then asserts
// that every `jsr:@sprout/<pkg>@<version>` pin matches the version field
// declared in packages/<pkg>/deno.jsonc. Exits 0 on success, 1 on drift.

import { getSproutPackages } from "./_sprout_versions.ts";

const ROOT = new URL("../", import.meta.url).pathname;

interface Mismatch {
  file: string;
  imported: string; // e.g. "@sprout/jsx"
  foundVersion: string;
  expectedVersion: string;
}

function checkFile(
  filePath: string,
  selfName: string | null,
  sproutPkgs: Record<string, { name: string; version: string }>,
): Mismatch[] {
  const mismatches: Mismatch[] = [];
  let content: string;
  try {
    content = Deno.readTextFileSync(filePath);
  } catch {
    return mismatches;
  }

  // Extract all jsr:@sprout/<pkg>@<version>[/<subpath>] pins from the file.
  // Handles both JSON (templates.ts) and JSONC (deno.jsonc) content.
  const pinRe = /jsr:@sprout\/([^@]+)@([^@/\s",`]+)(\/[^"\s]*)?/g;
  let match: RegExpExecArray | null;
  while ((match = pinRe.exec(content)) !== null) {
    const pkgShort = match[1]!; // e.g. "jsx", "config"
    const pinnedVersion = match[2]!; // e.g. "0.2.0"

    const fullName = "@sprout/" + pkgShort;

    // Skip self-references: @sprout/<self> pinned by the same package
    if (selfName !== null && fullName === selfName) {
      continue;
    }

    const canon = sproutPkgs[fullName];
    if (!canon) {
      // Unknown package — let other checks catch it
      continue;
    }

    if (canon.version !== pinnedVersion) {
      mismatches.push({
        file: filePath,
        imported: fullName,
        foundVersion: pinnedVersion,
        expectedVersion: canon.version,
      });
    }
  }

  return mismatches;
}

function main() {
  const sproutPkgs = getSproutPackages();
  const allErrors: Mismatch[] = [];

  // 1. Check every packages/*/deno.jsonc
  const pkgDirs = Deno.readDirSync(ROOT + "packages");
  for (const entry of pkgDirs) {
    if (!entry.isDirectory) continue;
    const configPath = ROOT + "packages/" + entry.name + "/deno.jsonc";
    let configText: string;
    try {
      configText = Deno.readTextFileSync(configPath);
    } catch {
      continue;
    }

    // Determine self name from the config (source of truth)
    const selfName = extractName(configText);

    const mismatches = checkFile(configPath, selfName, sproutPkgs);
    allErrors.push(...mismatches);
  }

  // 2. Check packages/cli/templates.ts (TEMPLATE_DENO_JSONC)
  const templatesPath = ROOT + "packages/cli/templates.ts";
  const templateMismatches = checkFile(templatesPath, null, sproutPkgs);
  allErrors.push(...templateMismatches);

  // Report
  if (allErrors.length > 0) {
    console.error("FAIL: Sprout package version drift detected.\n");
    const byFile = new Map<string, Mismatch[]>();
    for (const m of allErrors) {
      const list = byFile.get(m.file) ?? [];
      list.push(m);
      byFile.set(m.file, list);
    }
    for (const [file, mismatches] of byFile) {
      console.error(file);
      for (const m of mismatches) {
        console.error(
          `  @sprout/${
            m.imported.split("/")[1]
          } pin is ${m.foundVersion}, expected ${m.expectedVersion}`,
        );
      }
    }
    console.error(
      "\nRun `deno task check-sprout-versions` for details. Update all pins to match each package's version field.",
    );
    Deno.exit(1);
  }

  console.log("All Sprout package versions are in sync.");
  Deno.exit(0);
}

/** Strip JSONC comments and extract the `name` field value. */
function extractName(configText: string): string | null {
  const jsonText = configText
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  try {
    const parsed = JSON.parse(jsonText);
    if (typeof parsed.name === "string") return parsed.name;
  } catch {
    // ignore
  }
  return null;
}

main();
