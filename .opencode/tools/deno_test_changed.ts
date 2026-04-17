import { tool } from "@opencode-ai/plugin";

import { collectChangedFiles } from "../lib/git.ts";
import {
  chooseRelatedTests,
  runSelectedTests,
  scanTestFiles,
} from "../lib/tests.ts";

export default tool({
  description:
    "Find test files related to changed files in the git worktree, and optionally run them with deno test.",
  args: {
    maxFiles: tool.schema
      .number()
      .int()
      .min(1)
      .max(32)
      .default(12)
      .describe("Maximum number of related tests to return"),
    run: tool.schema
      .boolean()
      .default(false)
      .describe("Run the selected tests with deno test"),
  },
  async execute(args, context) {
    const changedFiles = await collectChangedFiles(context);
    const allTests = await scanTestFiles(context);
    const selection = chooseRelatedTests(changedFiles, allTests, args.maxFiles);

    if (!args.run) {
      return [
        `Changed files: ${selection.changedFiles.length}`,
        `Indexed tests: ${allTests.length}`,
        `Selected related tests: ${selection.relatedTests.length}`,
        "",
        "### Related tests",
        selection.relatedTests.length > 0
          ? selection.relatedTests.map((file) => `- ${file}`).join("\n")
          : "- None",
      ].join("\n");
    }

    return runSelectedTests(context, selection.relatedTests);
  },
});
