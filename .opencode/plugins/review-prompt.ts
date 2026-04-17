import type { Plugin } from "@opencode-ai/plugin";

import { collectChangedFiles } from "../lib/git.ts";
import {
  buildProjectReviewPrompt,
  isReviewableFile,
  selectProjectContextFiles,
} from "../lib/project.ts";
import { normalizePath } from "../lib/path.ts";

const MAX_CONTEXT_FILES = 8;
const MAX_RECENT_FILES = 25;

type LogLevel = "debug" | "info" | "warn" | "error";

export const ReviewPromptPlugin: Plugin = async (
  { client, directory, worktree },
) => {
  let changed = false;
  let running = false;
  let recentlyEditedPaths: string[] = [];

  const log = async (
    level: LogLevel,
    message: string,
    extra?: Record<string, unknown>,
  ) => {
    await client.app.log({
      body: {
        service: "review-prompt",
        level,
        message,
        extra,
      },
    });
  };

  const runReview = async () => {
    if (running) return;
    running = true;

    try {
      const changedFiles = await collectChangedFiles({ worktree, directory });
      if (changedFiles.length === 0) {
        await log("debug", "No changed files found for review");
        return;
      }

      const reviewFiles = selectProjectContextFiles(
        changedFiles,
        recentlyEditedPaths,
        MAX_CONTEXT_FILES,
      );

      const prompt = buildProjectReviewPrompt(changedFiles, reviewFiles);

      await client.tui.appendPrompt({
        body: {
          text: prompt,
        },
      });

      await client.tui.submitPrompt();

      await log("info", "Submitted project-level review prompt", {
        changedFilesCount: changedFiles.length,
        reviewFiles,
        omittedFiles: changedFiles.filter((file) =>
          !reviewFiles.includes(file)
        ),
      });

      changed = false;
      recentlyEditedPaths = [];
    } catch (error) {
      await log("error", "Failed to submit project-level review prompt", {
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

        const editedPath = extractEditedPath(event);
        if (editedPath && isReviewableFile(editedPath)) {
          recentlyEditedPaths = pushRecentPath(
            recentlyEditedPaths,
            editedPath,
            MAX_RECENT_FILES,
          );
        }
      }

      if (event.type === "session.idle" && changed) {
        await runReview();
      }
    },
  };
};

function extractEditedPath(event: unknown): string | null {
  if (!event || typeof event !== "object") return null;

  const record = event as Record<string, unknown>;
  if (record.type !== "file.edited") return null;

  const properties = record.properties;
  if (!properties || typeof properties !== "object") return null;

  const file = (properties as Record<string, unknown>).file;
  return typeof file === "string" ? file : null;
}

function pushRecentPath(
  paths: readonly string[],
  path: string,
  maxItems: number,
): string[] {
  const normalized = normalizePath(path);
  const next = paths.filter((item) => item !== normalized);
  next.push(normalized);
  return next.slice(-maxItems);
}
