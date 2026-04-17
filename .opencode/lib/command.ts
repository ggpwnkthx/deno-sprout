import { spawn } from "node:child_process";

export interface RuntimeContext {
  readonly directory?: string;
  readonly worktree?: string;
}

export type WorktreeContext = RuntimeContext & {
  readonly worktree: string;
};

export interface CommandOptions {
  readonly cwd?: string;
  readonly env?: Record<string, string>;
}

export interface CommandResult {
  readonly cmd: readonly string[];
  readonly cwd: string | undefined;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export async function runCommand(
  context: RuntimeContext,
  cmd: readonly string[],
  options: CommandOptions = {},
): Promise<CommandResult> {
  const cwd = options.cwd ?? context.directory;
  const env = options.env ? { ...process.env, ...options.env } : process.env;

  const proc = spawn(cmd[0], cmd.slice(1), {
    cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const stdoutChunks: Uint8Array[] = [];
  const stderrChunks: Uint8Array[] = [];

  proc.stdout?.on("data", (chunk: Uint8Array) => {
    stdoutChunks.push(chunk);
  });

  proc.stderr?.on("data", (chunk: Uint8Array) => {
    stderrChunks.push(chunk);
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    proc.on("error", reject);
    proc.on("close", (code) => resolve(code ?? 1));
  });

  return {
    cmd,
    cwd,
    exitCode,
    stdout: Buffer.concat(stdoutChunks).toString("utf8"),
    stderr: Buffer.concat(stderrChunks).toString("utf8"),
  };
}

export function formatCommand(cmd: readonly string[]): string {
  return cmd.map(quoteShellToken).join(" ");
}

export function quoteShellToken(token: string): string {
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(token)) {
    return token;
  }
  return `'${token.replaceAll("'", `'\\''`)}'`;
}

export function clipText(text: string, maxChars = 8_000): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n…[truncated ${
    text.length - maxChars
  } chars]`;
}
