import type { Plugin } from "@opencode-ai/plugin";

type LogLevel = "debug" | "info" | "warn" | "error";

const BLOCKED_PATTERNS: ReadonlyArray<{
  readonly pattern: RegExp;
  readonly message: string;
}> = [
    {
      pattern: /^\s*node(?:\s|$)/,
      message: "Do not use `node` directly in this Deno repo.",
    },
    {
      pattern: /^\s*(npm|pnpm|yarn)\s+(install|add|exec|dlx|create)(?:\s|$)/,
      message:
        "Do not install or execute dependencies with npm/pnpm/yarn in this Deno repo.",
    },
    {
      pattern: /^\s*npx(?:\s|$)/,
      message:
        "Do not use `npx` in this Deno repo. Prefer `deno task`, `deno run`, or a custom OpenCode tool.",
    },
    {
      pattern: /^\s*(ts-node|tsx)(?:\s|$)/,
      message: "Do not use ts-node/tsx in this Deno repo. Prefer `deno run`.",
    },
    {
      pattern: /^\s*(jest|vitest)(?:\s|$)/,
      message:
        "Do not use Jest/Vitest directly in this Deno repo. Prefer `deno test -A` or a Deno task.",
    },
    {
      pattern: /^\s*tsc(?!\s+--noEmit\s*$)(?:\s|$)/,
      message:
        "Do not use arbitrary `tsc` commands in this Deno repo. Prefer `deno check`.",
    },
  ];

export const DenoCommandsPlugin: Plugin = async ({ client }) => {
  const log = async (
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
  ) => {
    await client.app.log({
      body: {
        service: "deno-commands",
        level,
        message,
        extra,
      },
    });
  };

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return;

      const command = getStringArg(output.args, "command");
      if (!command) return;

      for (const rule of BLOCKED_PATTERNS) {
        if (rule.pattern.test(command)) {
          await log("warn", "Blocked non-Deno shell command", { command });
          throw new Error(rule.message);
        }
      }

      const rewrite = rewriteCommand(command);
      if (!rewrite) return;

      output.args.command = rewrite.replacement;
      await log("info", "Rewrote shell command for Deno repo", {
        from: command,
        to: rewrite.replacement,
        reason: rewrite.reason,
      });
    },
  };
};

function rewriteCommand(
  command: string,
): { readonly replacement: string; readonly reason: string } | null {
  const packageRun = command.match(
    /^\s*(npm|pnpm|yarn|bun)\s+run\s+([A-Za-z0-9:_-]+)(?<rest>.*)$/s,
  );
  if (packageRun) {
    return {
      replacement: `deno task ${packageRun[2]}${packageRun.groups?.rest ?? ""}`,
      reason:
        "Use `deno task` instead of package-manager scripts in Deno repos.",
    };
  }

  const npmTest = command.match(/^\s*(npm|pnpm|yarn|bun)\s+test(?<rest>.*)$/s);
  if (npmTest) {
    return {
      replacement: `deno test -A${npmTest.groups?.rest ?? ""}`,
      reason:
        "Use `deno test -A` instead of package-manager test commands in Deno repos.",
    };
  }

  const eslint = command.match(/^\s*eslint(?<rest>.*)$/s);
  if (eslint) {
    return {
      replacement: `deno lint${eslint.groups?.rest ?? ""}`,
      reason: "Prefer Deno's built-in linter in Deno repos.",
    };
  }

  const prettier = command.match(/^\s*prettier(?<rest>.*)$/s);
  if (prettier) {
    const rest = (prettier.groups?.rest ?? "").replace(/\s--check\b/g, "");
    const commandName = /\s--check\b/.test(command)
      ? "deno fmt --check"
      : "deno fmt";

    return {
      replacement: `${commandName}${rest}`,
      reason: "Prefer Deno's built-in formatter in Deno repos.",
    };
  }

  if (/^\s*tsc\s+--noEmit\s*$/i.test(command)) {
    return {
      replacement: "deno check",
      reason: "Prefer Deno's built-in type-checking in Deno repos.",
    };
  }

  return null;
}

function getStringArg(
  args: unknown,
  key: string,
): string | null {
  if (!args || typeof args !== "object") return null;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
