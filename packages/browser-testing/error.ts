/** Shared error and capture utilities. */

import type { CaptureResult } from "./types.ts";

export function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? error.message;
  }

  return Deno.inspect(error, {
    depth: 8,
    iterableLimit: 200,
    strAbbreviateSize: 400,
    colors: false,
  });
}

export function trimPreview(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength)}…`;
}

export async function capture<T>(
  run: () => Promise<T>,
): Promise<CaptureResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error: toErrorMessage(error) };
  }
}
