import { tool } from "@opencode-ai/plugin";

import { clipText, runCommand } from "../lib/command.ts";

export default tool({
  description:
    "Run `deno cache` for explicit targets inside the current worktree.",
  args: {
    targets: tool.schema
      .array(tool.schema.string().min(1))
      .min(1)
      .max(24)
      .describe("Files or module specifiers to cache"),
    reload: tool.schema
      .boolean()
      .default(false)
      .describe("Whether to pass --reload"),
  },
  async execute(args, context) {
    for (const target of args.targets) {
      validateTarget(target);
    }

    const command = ["deno", "cache"];
    if (args.reload) {
      command.push("--reload");
    }
    command.push(...args.targets);

    const result = await runCommand(context, command, {
      cwd: context.worktree,
    });

    return [
      `Exit code: ${result.exitCode}`,
      "",
      "### Command",
      command.join(" "),
      "",
      "### Stdout",
      clipText(result.stdout, 12_000) || "(empty)",
      "",
      "### Stderr",
      clipText(result.stderr, 12_000) || "(empty)",
    ].join("\n");
  },
});

function validateTarget(target: string): void {
  if (target.includes("\n") || target.includes("\r")) {
    throw new Error("targets may not contain newlines");
  }
}
