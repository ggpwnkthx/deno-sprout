import { runCommand, type WorktreeContext } from "./command.ts";
import { isReviewableFile } from "./project.ts";
import { normalizePath } from "./path.ts";

const CHANGE_COMMANDS = [
  ["git", "diff", "--name-only", "--diff-filter=ACMR"],
  ["git", "diff", "--cached", "--name-only", "--diff-filter=ACMR"],
  ["git", "ls-files", "--others", "--exclude-standard"],
] as const;

export async function collectChangedFiles(
  context: WorktreeContext,
): Promise<string[]> {
  const files = new Set<string>();

  for (const cmd of CHANGE_COMMANDS) {
    const result = await runCommand(context, cmd, { cwd: context.worktree });
    if (result.exitCode !== 0) {
      continue;
    }

    for (const line of result.stdout.split(/\r?\n/)) {
      const file = line.trim();
      if (!file) continue;
      if (!isReviewableFile(file)) continue;
      files.add(normalizePath(file));
    }
  }

  return [...files].sort((a, b) => a.localeCompare(b));
}
