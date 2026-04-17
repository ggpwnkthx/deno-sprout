import { tool } from "@opencode-ai/plugin";

import { clipText, runCommand } from "../lib/command.ts";
import { isWithin, joinPath } from "../lib/path.ts";

export default tool({
  description: "Run an approved deno task inside the current project worktree.",
  args: {
    task: tool.schema.string().min(1).describe(
      "Task name from deno.json or deno.jsonc",
    ),
    extraArgs: tool.schema
      .array(tool.schema.string().min(1))
      .max(24)
      .default([])
      .describe("Additional task arguments"),
    cwd: tool.schema
      .string()
      .optional()
      .describe("Optional relative working directory inside the worktree"),
  },
  async execute(args, context) {
    const cwd = resolveCwd(context.worktree, args.cwd);

    validateTaskName(args.task);
    for (const item of args.extraArgs) {
      validateSafeToken(item, "extraArgs");
    }

    const result = await runCommand(
      context,
      ["deno", "task", args.task, ...args.extraArgs],
      { cwd },
    );

    return [
      `Exit code: ${result.exitCode}`,
      "",
      "### Command",
      `deno task ${args.task}${
        args.extraArgs.length > 0 ? ` ${args.extraArgs.join(" ")}` : ""
      }`,
      "",
      "### Stdout",
      clipText(result.stdout, 12_000) || "(empty)",
      "",
      "### Stderr",
      clipText(result.stderr, 12_000) || "(empty)",
    ].join("\n");
  },
});

function resolveCwd(worktree: string, cwd: string | undefined): string {
  if (!cwd) return worktree;

  const resolved = joinPath(worktree, cwd);
  if (!isWithin(worktree, resolved)) {
    throw new Error("cwd must stay within the current worktree");
  }

  return resolved;
}

function validateTaskName(task: string): void {
  validateSafeToken(task, "task");
}

function validateSafeToken(value: string, fieldName: string): void {
  if (/[\r\n\0]/.test(value)) {
    throw new Error(`${fieldName} contains unsupported control characters`);
  }
}
