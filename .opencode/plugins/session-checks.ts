import type { Plugin } from "@opencode-ai/plugin";

import { clipText, formatCommand, runCommand } from "../lib/command.ts";
import { collectChangedFiles } from "../lib/git.ts";
import { isTestFile } from "../lib/project.ts";

type LogLevel = "debug" | "info" | "warn" | "error";

interface StepResult {
  readonly name: string;
  readonly command: readonly string[];
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export const SessionChecksPlugin: Plugin = async (
  { client, directory, worktree },
) => {
  let changed = false;
  let running = false;

  const log = async (
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
  ) => {
    await client.app.log({
      body: {
        service: "session-checks",
        level,
        message,
        extra,
      },
    });
  };

  const runChecks = async () => {
    if (running) return;
    running = true;

    try {
      const changedFiles = await collectChangedFiles({ worktree, directory });

      if (changedFiles.length === 0) {
        await log("debug", "No changed files found; skipping session checks");
        return;
      }

      const commands: string[][] = [
        ["deno", "fmt", "--check"],
        ["deno", "lint"],
        ["deno", "check"],
      ];

      if (changedFiles.some((file) => isTestFile(file))) {
        commands.push(["deno", "test"]);
      }

      const results: StepResult[] = [];
      let failed = false;

      for (const command of commands) {
        const result = await runCommand({ directory, worktree }, command, {
          cwd: worktree,
        });
        results.push({
          name: command.slice(0, 2).join(" "),
          command,
          exitCode: result.exitCode,
          stdout: result.stdout,
          stderr: result.stderr,
        });

        if (result.exitCode !== 0) {
          failed = true;
        }
      }

      if (!failed) {
        await log("info", "Deno session checks passed", {
          changedFilesCount: changedFiles.length,
          commands: results.map((result) => formatCommand(result.command)),
        });
        return;
      }

      const summary = buildFailurePrompt(results);
      await client.tui.appendPrompt({
        body: {
          text: summary,
        },
      });
      await client.tui.submitPrompt();

      await log("error", "Deno session checks failed", {
        changedFilesCount: changedFiles.length,
        failures: results.filter((item) => item.exitCode !== 0).map((item) => ({
          command: formatCommand(item.command),
          exitCode: item.exitCode,
          stdout: clipText(item.stdout, 4_000),
          stderr: clipText(item.stderr, 4_000),
        })),
      });
    } catch (error) {
      await log("error", "Failed to execute Deno session checks", {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      running = false;
    }
  };

  return {
    event: async ({ event }) => {
      if (event.type === "file.edited") {
        changed = true;
      }

      if (event.type === "session.idle" && changed) {
        changed = false;
        await runChecks();
      }
    },
  };
};

function buildFailurePrompt(results: readonly StepResult[]): string {
  const failedSteps = results.filter((result) => result.exitCode !== 0);

  return [
    "The automated Deno checks failed after the latest edits.",
    "Prefer routing verification triage through @deno-release-manager, and pull in @deno-reviewer when the failures imply deeper structural or typing issues.",
    "",
    "Fix the underlying issues before making more changes.",
    "",
    "## Failed checks",
    ...failedSteps.flatMap((result) => [
      `### ${formatCommand(result.command)}`,
      `- Exit code: ${result.exitCode}`,
      "- Stdout:",
      "```text",
      clipText(result.stdout, 4_000) || "(empty)",
      "```",
      "- Stderr:",
      "```text",
      clipText(result.stderr, 4_000) || "(empty)",
      "```",
      "",
    ]),
    "## Instructions",
    "- Prefer minimal, root-cause fixes.",
    "- Keep the project Deno-first.",
    "- Do not add Node/npm workarounds.",
  ].join("\n");
}
