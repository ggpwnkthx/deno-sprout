import {
  basename,
  dirname,
  extname,
  joinPath,
  normalizePath,
  stripExtension,
} from "./path.ts";
import { formatAgentMention, suggestReviewAgents } from "./agents.ts";

const REVIEWABLE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
  ".go",
  ".rs",
  ".py",
  ".java",
  ".kt",
  ".swift",
  ".php",
  ".rb",
  ".cs",
]);

const REVIEWABLE_FILENAMES = new Set([
  "deno.json",
  "deno.jsonc",
  "import_map.json",
  "package.json",
  "package-lock.json",
  "bun.lock",
  "bun.lockb",
  "tsconfig.json",
  "README.md",
]);

const TEST_SUFFIXES = [
  ".test.ts",
  ".test.tsx",
  ".test.js",
  ".test.jsx",
  ".test.mts",
  ".test.cts",
  ".test.mjs",
  ".test.cjs",
  ".spec.ts",
  ".spec.tsx",
  ".spec.js",
  ".spec.jsx",
  ".spec.mts",
  ".spec.cts",
  ".spec.mjs",
  ".spec.cjs",
] as const;

const IGNORED_PREFIXES = [
  ".git/",
  ".opencode/",
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".turbo/",
] as const;

const IGNORED_SEGMENTS = [
  "/.git/",
  "/.opencode/",
  "/node_modules/",
  "/dist/",
  "/build/",
  "/coverage/",
  "/.turbo/",
] as const;

export function isReviewableFile(path: string): boolean {
  const normalized = normalizePath(path);

  if (IGNORED_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
    return false;
  }

  if (IGNORED_SEGMENTS.some((segment) => normalized.includes(segment))) {
    return false;
  }

  if (REVIEWABLE_FILENAMES.has(basename(normalized))) {
    return true;
  }

  return REVIEWABLE_EXTENSIONS.has(extname(normalized));
}

export function isTestFile(path: string): boolean {
  const normalized = normalizePath(path);
  return TEST_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

export function getDirectoryBucket(path: string): string {
  const normalized = normalizePath(path);
  const parts = normalized.split("/");

  if (parts.length <= 2) return normalized;
  return parts.slice(0, 2).join("/");
}

export function scoreProjectFile(
  file: string,
  recentlyEditedPaths: readonly string[],
): number {
  const normalized = normalizePath(file);
  const parts = normalized.split("/");
  const fileName = parts[parts.length - 1] ?? normalized;
  const depth = parts.length;
  const recentIndex = recentlyEditedPaths.lastIndexOf(normalized);

  let score = 0;

  if (recentIndex >= 0) {
    score += 20 + recentIndex;
  }

  if (depth <= 2) {
    score += 8;
  }

  if (/\/(src|app|server|packages|lib|routes)\//.test(`/${normalized}`)) {
    score += 6;
  }

  if (
    /(index|route|router|controller|service|repo|repository|model|schema|config|client|server|handler|middleware)\./
      .test(fileName)
  ) {
    score += 10;
  }

  if (isTestFile(fileName)) {
    score -= 4;
  }

  return score;
}

export function selectProjectContextFiles(
  files: readonly string[],
  recentlyEditedPaths: readonly string[],
  maxFiles: number,
): string[] {
  const unique = [...new Set(files.map(normalizePath))];
  if (unique.length <= maxFiles) return unique;

  const scored = unique
    .map((file) => ({
      file,
      bucket: getDirectoryBucket(file),
      score: scoreProjectFile(file, recentlyEditedPaths),
    }))
    .sort((a, b) => b.score - a.score || a.file.localeCompare(b.file));

  const selected: string[] = [];
  const seenBuckets = new Set<string>();

  for (const item of scored) {
    if (selected.length >= maxFiles) break;
    if (seenBuckets.has(item.bucket)) continue;

    selected.push(item.file);
    seenBuckets.add(item.bucket);
  }

  for (const item of scored) {
    if (selected.length >= maxFiles) break;
    if (!selected.includes(item.file)) {
      selected.push(item.file);
    }
  }

  return selected;
}

export function buildProjectReviewPrompt(
  changedFiles: readonly string[],
  reviewFiles: readonly string[],
): string {
  const suggestedAgents = suggestReviewAgents(changedFiles);
  const delegationList = suggestedAgents.length === 0
    ? "- None"
    : suggestedAgents
      .map((agent) => `- ${formatAgentMention(agent.name)} — ${agent.reason}`)
      .join("\n");

  const referencedFiles = reviewFiles.length === 0
    ? "none"
    : reviewFiles.map((file) => `@${file}`).join(" ");

  const reviewFileList = reviewFiles.length === 0
    ? "- None"
    : reviewFiles.map((file) => `- @${file}`).join("\n");

  const omittedFiles = changedFiles.filter((file) =>
    !reviewFiles.includes(file)
  );
  const omittedFileList = omittedFiles.length === 0
    ? "- None"
    : omittedFiles.map((file) => `- ${file}`).join("\n");

  return [
    "Perform a strict code-quality review of the current change set.",
    "",
    `Total changed files detected: ${changedFiles.length}`,
    "",
    reviewFiles.length > 0
      ? `Referenced files for direct inspection: ${referencedFiles}`
      : "Referenced files for direct inspection: none",
    "",
    "Preferred delegation:",
    delegationList,
    "",
    "Review instructions:",
    "- When task delegation is available, route the review through the suggested read-only subagents and then synthesize the result.",
    "- Grade the work heuristically at the project level, not as a review of one file.",
    "- Use architecture, boundary design, data flow, and consistency across files to infer project quality.",
    "- Do not anchor on the most recently edited file or any single file unless it is clearly the dominant risk.",
    "- Do not make code changes. Review only.",
    "- Do not be nice for the sake of being nice.",
    "- Any grade below B+ must be addressed.",
    "- Call out specific symbols, code paths, interface boundaries, and complexity hot spots.",
    "- Flag change-set level issues such as duplicated logic across files, fractured ownership, inconsistent validation, mixed abstractions, and missing end-to-end flow coverage.",
    "- Flag memory-risk patterns such as whole-payload reads, unnecessary buffering, missing pagination/cursors, and avoidable O(n^2) scans.",
    "- Flag missing centralized validation for HTTP input, params, env, files, and parsed JSON.",
    "- Flag weak typing at boundaries: domain entities, config, external I/O, and errors.",
    "- Flag poor modularity, duplication, poor folder placement, or code that does not look production-grade.",
    "",
    "Grade these categories using letter grades:",
    "1. DRY / modularity / clear folder boundaries",
    "2. Memory safety / streaming / chunking / pagination / complexity awareness",
    "3. Validation of untrusted input / fail-fast typed errors",
    "4. Strong typing for entities, boundaries, config, and errors",
    "",
    "Use this exact output structure:",
    "",
    "## Overall grade",
    "- Grade: <A+|A|A-|B+|B|B-|C+|C|C-|D|F>",
    "- Verdict: <1-3 sentences>",
    "",
    "## Category grades",
    "- DRY / modularity / folders: <grade>",
    "- Memory safety / complexity: <grade>",
    "- Validation / typed failures: <grade>",
    "- Strong typing / interfaces: <grade>",
    "",
    "## What is good",
    "- <bullets>",
    "",
    "## What is weak",
    "- <bullets>",
    "",
    "## Must address before merge",
    "- Include this section if ANY category or the overall grade is below B+.",
    "- Be concrete and prioritized.",
    "",
    "## Complexity and memory hot spots",
    "- <bullets>",
    "",
    "## Suggested next edits",
    "- <small, concrete changes>",
    "",
    "Referenced changed files:",
    reviewFileList,
    "",
    "Additional changed files not directly referenced:",
    omittedFileList,
  ].join("\n");
}

export function candidateRelatedTestPaths(path: string): string[] {
  const normalized = normalizePath(path);

  if (isTestFile(normalized)) {
    return [normalized];
  }

  const withoutExtension = stripExtension(normalized);
  const currentDirectory = dirname(normalized);
  const currentFile = basename(withoutExtension);

  const candidates = new Set<string>();

  for (const suffix of TEST_SUFFIXES) {
    candidates.add(`${withoutExtension}${suffix}`);
    candidates.add(joinPath(currentDirectory, `${currentFile}${suffix}`));
    candidates.add(
      joinPath("tests", currentDirectory, `${currentFile}${suffix}`),
    );
    candidates.add(
      joinPath("test", currentDirectory, `${currentFile}${suffix}`),
    );
  }

  return [...candidates];
}
