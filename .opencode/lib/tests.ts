import { readdir } from "node:fs/promises";
import { join as joinFsPath } from "node:path";

import { clipText, runCommand, type WorktreeContext } from "./command.ts";
import { basename, dirname, joinPath, normalizePath } from "./path.ts";
import { candidateRelatedTestPaths, isTestFile } from "./project.ts";

const TEST_GLOB_SUFFIXES = [
  "test.ts",
  "test.tsx",
  "test.js",
  "test.jsx",
  "test.mts",
  "test.cts",
  "test.mjs",
  "test.cjs",
  "spec.ts",
  "spec.tsx",
  "spec.js",
  "spec.jsx",
  "spec.mts",
  "spec.cts",
  "spec.mjs",
  "spec.cjs",
] as const;

export interface RelatedTestSelection {
  readonly changedFiles: readonly string[];
  readonly relatedTests: readonly string[];
}

export async function scanTestFiles(
  context: WorktreeContext,
  maxFiles = 20_000,
): Promise<string[]> {
  const found = new Set<string>();

  await walkDirectory(context.worktree, "", found, maxFiles);

  return [...found].sort((a, b) => a.localeCompare(b));
}

async function walkDirectory(
  root: string,
  relativeDir: string,
  found: Set<string>,
  maxFiles: number,
): Promise<void> {
  if (found.size >= maxFiles) return;

  const absoluteDir = relativeDir ? joinFsPath(root, relativeDir) : root;
  const entries = await readdir(absoluteDir, { withFileTypes: true });

  for (const entry of entries) {
    const relativePath = relativeDir
      ? joinPath(relativeDir, entry.name)
      : normalizePath(entry.name);

    if (entry.isDirectory()) {
      await walkDirectory(root, relativePath, found, maxFiles);
      if (found.size >= maxFiles) return;
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (
      TEST_GLOB_SUFFIXES.some((suffix) => relativePath.endsWith(`.${suffix}`))
    ) {
      found.add(relativePath);
      if (found.size >= maxFiles) return;
    }
  }
}

export function chooseRelatedTests(
  changedFiles: readonly string[],
  allTests: readonly string[],
  maxFiles = 12,
): RelatedTestSelection {
  const testIndex = new Set(allTests.map(normalizePath));
  const direct = new Set<string>();

  for (const changed of changedFiles) {
    const normalized = normalizePath(changed);
    if (isTestFile(normalized)) {
      direct.add(normalized);
      continue;
    }

    for (const candidate of candidateRelatedTestPaths(normalized)) {
      if (testIndex.has(candidate)) {
        direct.add(candidate);
      }
    }
  }

  if (direct.size >= maxFiles) {
    return {
      changedFiles,
      relatedTests: [...direct].slice(0, maxFiles).sort((a, b) =>
        a.localeCompare(b)
      ),
    };
  }

  const ranked = allTests
    .map((testFile) => ({
      path: normalizePath(testFile),
      score: scoreTestFile(testFile, changedFiles),
    }))
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  const selected = new Set<string>(direct);

  for (const item of ranked) {
    if (selected.size >= maxFiles) break;
    if (item.score <= 0) continue;
    selected.add(item.path);
  }

  return {
    changedFiles,
    relatedTests: [...selected].sort((a, b) => a.localeCompare(b)),
  };
}

function scoreTestFile(
  testFile: string,
  changedFiles: readonly string[],
): number {
  const normalizedTest = normalizePath(testFile);
  const testDir = dirname(normalizedTest);
  const testName = basename(normalizedTest);

  let score = 0;

  for (const changed of changedFiles) {
    const normalizedChanged = normalizePath(changed);

    if (normalizedTest === normalizedChanged) {
      score += 100;
      continue;
    }

    if (dirname(normalizedChanged) === testDir) {
      score += 25;
    }

    const changedBase = basename(normalizedChanged).replace(/\.[^.]+$/, "");
    if (testName.includes(changedBase)) {
      score += 30;
    }

    const changedDir = dirname(normalizedChanged);
    if (testDir.endsWith(changedDir) || changedDir.endsWith(testDir)) {
      score += 12;
    }
  }

  return score;
}

export async function runSelectedTests(
  context: WorktreeContext,
  testFiles: readonly string[],
): Promise<string> {
  if (testFiles.length === 0) {
    return "No related test files were found.";
  }

  const result = await runCommand(context, ["deno", "test", ...testFiles], {
    cwd: context.worktree,
  });

  const sections = [
    `Exit code: ${result.exitCode}`,
    "",
    "### Command",
    `deno test ${testFiles.join(" ")}`,
    "",
    "### Stdout",
    clipText(result.stdout, 12_000) || "(empty)",
    "",
    "### Stderr",
    clipText(result.stderr, 12_000) || "(empty)",
  ];

  return sections.join("\n");
}
