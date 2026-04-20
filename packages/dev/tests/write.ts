// write.ts - File writing utilities for @ggpwnkthx/sprout-dev tests
import { join } from "@std/path";

/**
 * Write a file to a directory, creating parent directories as needed.
 */
export async function writeFile(
  destDir: string,
  filePath: string,
  content: string,
): Promise<void> {
  const fullPath = join(destDir, filePath);
  await Deno.mkdir(join(fullPath, ".."), { recursive: true });
  await Deno.writeTextFile(fullPath, content);
}

/**
 * Write a route file (a JSX page component) to a routes directory.
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

/**
 * Write an island component file to an islands directory.
 */
export async function writeIsland(
  islandsDir: string,
  filePath: string,
  content: string,
): Promise<void> {
  const fullPath = join(islandsDir, filePath);
  await Deno.mkdir(join(fullPath, ".."), { recursive: true });
  await Deno.writeTextFile(fullPath, content);
}

/**
 * Clean up a temp directory. Use with `finally` to ensure cleanup
 * even when a test throws.
 */
export async function withTempDir(
  fn: (dir: string) => Promise<void>,
): Promise<void> {
  const tmp = await Deno.makeTempDir({ prefix: "sprout-dev-test-" });
  try {
    await fn(tmp);
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
}
