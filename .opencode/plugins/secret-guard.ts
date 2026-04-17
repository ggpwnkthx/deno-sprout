import type { Plugin } from "@opencode-ai/plugin";

const SECRET_FILE_PATTERNS = [
  /\.env(?:\.[^/]+)?$/i,
  /(^|\/)\.env$/i,
  /\.pem$/i,
  /\.p12$/i,
  /\.pfx$/i,
  /(^|\/)id_(rsa|ed25519)$/i,
  /(^|\/)credentials\.json$/i,
  /(^|\/)\.npmrc$/i,
] as const;

const SAFE_SECRET_EXCEPTIONS = [
  /\.env\.example$/i,
  /\.env\.sample$/i,
  /\.env\.template$/i,
] as const;

export const SecretGuardPlugin: Plugin = async ({ client }) => {
  const log = async (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    extra?: Record<string, unknown>,
  ) => {
    await client.app.log({
      body: {
        service: "secret-guard",
        level,
        message,
        extra,
      },
    });
  };

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "read") {
        const filePath = getStringArg(output.args, "filePath");
        if (!filePath) return;

        if (looksSecret(filePath)) {
          await log("warn", "Blocked secret file read", { filePath });
          throw new Error(`Refusing to read sensitive file: ${filePath}`);
        }

        return;
      }

      if (input.tool === "bash") {
        const command = getStringArg(output.args, "command");
        if (!command) return;

        if (looksLikeSecretShellRead(command)) {
          await log("warn", "Blocked shell access to likely secret material", {
            command,
          });
          throw new Error(
            "Refusing shell command that appears to read secret material.",
          );
        }
      }
    },
  };
};

function looksSecret(path: string): boolean {
  if (SAFE_SECRET_EXCEPTIONS.some((pattern) => pattern.test(path))) {
    return false;
  }

  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(path));
}

function looksLikeSecretShellRead(command: string): boolean {
  const lower = command.toLowerCase();

  if (/\b(printenv|env)\b/.test(lower)) {
    return true;
  }

  if (!/\b(cat|sed|awk|grep|rg|less|more|head|tail)\b/.test(lower)) {
    return false;
  }

  return SECRET_FILE_PATTERNS.some((pattern) => pattern.test(command));
}

function getStringArg(
  args: unknown,
  key: string,
): string | null {
  if (!args || typeof args !== "object") return null;
  const value = (args as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}
