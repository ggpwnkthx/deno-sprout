import { tool } from "@opencode-ai/plugin";

import { clipText, runCommand } from "../lib/command.ts";

export default tool({
  description: "Run `deno info` for a specific file or module specifier.",
  args: {
    target: tool.schema
      .string()
      .min(1)
      .describe("A file path or module specifier"),
    json: tool.schema
      .boolean()
      .default(false)
      .describe("Whether to return JSON output from deno info"),
  },
  async execute(args, context) {
    if (args.target.includes("\n") || args.target.includes("\r")) {
      throw new Error("target may not contain newlines");
    }

    const command = ["deno", "info"];
    if (args.json) {
      command.push("--json");
    }
    command.push(args.target);

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
      clipText(result.stdout, 16_000) || "(empty)",
      "",
      "### Stderr",
      clipText(result.stderr, 8_000) || "(empty)",
    ].join("\n");
  },
});
