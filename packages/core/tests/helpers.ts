// helpers.ts - Shared test utilities for @ggpwnkthx/sprout-core tests
import { join } from "@std/path";

/**
 * Write a route file to a routes directory, creating parent directories as needed.
 *
 * @param routesDir - The root routes directory (e.g. `/tmp/routes`).
 * @param filePath - Relative path within routesDir, e.g. `index.tsx` or `blog/_layout.tsx`.
 *                   No validation is performed — caller must ensure the resulting
 *                   path stays inside routesDir.
 * @param content - The file content to write.
 */
export async function writeRoute(
  routesDir: string,
  filePath: string,
  content: string,
): Promise<void> {
  const fullPath = join(routesDir, filePath);
  await Deno.mkdir(join(fullPath, ".."), { recursive: true });
  await Deno.writeTextFile(fullPath, content);
}
