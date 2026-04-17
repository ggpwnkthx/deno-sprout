import { basename, dirname, normalizePath } from "./path.ts";

export interface AgentSuggestion {
  readonly name: string;
  readonly reason: string;
}

export const AGENT_NAMES = {
  lead: "deno-lead",
  implementer: "deno-implementer",
  reviewer: "deno-reviewer",
  httpAuditor: "deno-http-auditor",
  performanceAuditor: "deno-performance-auditor",
  releaseManager: "deno-release-manager",
} as const;

export function formatAgentMention(name: string): string {
  return `@${name}`;
}

export function suggestReviewAgents(
  changedFiles: readonly string[],
): AgentSuggestion[] {
  const suggestions: AgentSuggestion[] = [
    {
      name: AGENT_NAMES.reviewer,
      reason:
        "always use a strict read-only reviewer for structure, typing, and dependency drift on non-trivial change sets",
    },
  ];

  if (changedFiles.some(isHttpRelatedPath)) {
    suggestions.push({
      name: AGENT_NAMES.httpAuditor,
      reason: "changed files look HTTP-, route-, or config-boundary related",
    });
  }

  if (changedFiles.some(isPerformanceSensitivePath)) {
    suggestions.push({
      name: AGENT_NAMES.performanceAuditor,
      reason: "changed files look performance- or data-volume-sensitive",
    });
  }

  return dedupeSuggestions(suggestions);
}

function dedupeSuggestions(
  suggestions: readonly AgentSuggestion[],
): AgentSuggestion[] {
  const seen = new Set<string>();
  const output: AgentSuggestion[] = [];

  for (const suggestion of suggestions) {
    if (seen.has(suggestion.name)) continue;
    seen.add(suggestion.name);
    output.push(suggestion);
  }

  return output;
}

function isHttpRelatedPath(path: string): boolean {
  const normalized = normalizePath(path);
  const fileName = basename(normalized).toLowerCase();
  const directory = dirname(normalized).toLowerCase();
  const value = `${directory}/${fileName}`;

  return /(route|routes|http|api|handler|middleware|controller|server|request|response|auth|config)/
    .test(
      value,
    );
}

function isPerformanceSensitivePath(path: string): boolean {
  const normalized = normalizePath(path);
  const fileName = basename(normalized).toLowerCase();
  const directory = dirname(normalized).toLowerCase();
  const value = `${directory}/${fileName}`;

  return /(stream|queue|worker|job|batch|scan|search|index|cache|file|parser|import|export|sync|list|paginate|cursor|perf|performance|benchmark)/
    .test(value);
}
