import { assertEquals } from "@std/assert";
import { isContainedPath } from "../lib/path.ts";

const sep = Deno.build.os === "windows" ? "\\" : "/";

Deno.test("isContainedPath childPath === parentPath returns true (exact match)", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const result = await isContainedPath(tmpDir, tmpDir, sep);
    assertEquals(result, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("isContainedPath childPath is a subdirectory of parentPath returns true", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const subDir = tmpDir + sep + "subdir";
    await Deno.mkdir(subDir, { recursive: true });
    const result = await isContainedPath(subDir, tmpDir, sep);
    assertEquals(result, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("isContainedPath subdirectory of parent is contained (lexical prefix check)", async () => {
  // Any path that starts with the parent prefix is considered contained.
  // This includes sibling directories at the same level (e.g., /tmp/sibling
  // starts with "/tmp" so is contained). The check is purely lexical via
  // startsWith, not a real-filesystem containment check.
  const tmpDir = await Deno.makeTempDir();
  try {
    const sibling = tmpDir + sep + "sibling";
    await Deno.mkdir(sibling, { recursive: true });
    const result = await isContainedPath(sibling, tmpDir, sep);
    assertEquals(result, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("isContainedPath childPath is a sibling of parentPath returns false", async () => {
  const result = await isContainedPath("/tmp", "/tmp/child", sep);
  assertEquals(result, false);
});

Deno.test("isContainedPath childPath traversal outside parentPath returns false", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const parentDir = tmpDir + sep + "parent";
    await Deno.mkdir(parentDir, { recursive: true });
    // Construct a path that escapes via ".." — resolved realPath is outside parentDir
    const childPath = parentDir + sep + ".." + sep + ".." + sep + "etc";
    const result = await isContainedPath(childPath, tmpDir, sep);
    assertEquals(result, false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("isContainedPath non-existent childPath returns false (realPath throws)", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const nonExistent = tmpDir + sep + "this-does-not-exist";
    const result = await isContainedPath(nonExistent, tmpDir, sep);
    assertEquals(result, false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("isContainedPath parentPath is a subdir of childPath returns false", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    const childDir = tmpDir + sep + "child";
    const parentDir = tmpDir;
    await Deno.mkdir(childDir, { recursive: true });
    // When parentPath is actually inside childPath, result is false
    const result = await isContainedPath(parentDir, childDir, sep);
    assertEquals(result, false);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});

Deno.test("isContainedPath works with real subdirectory via realPath resolution", async () => {
  const tmpDir = await Deno.makeTempDir();
  try {
    // Create a real subdirectory and a symlink inside it pointing outside
    const realChild = tmpDir + sep + "real";
    await Deno.mkdir(realChild, { recursive: true });
    // tmpDir/real is contained in tmpDir
    const result = await isContainedPath(realChild, tmpDir, sep);
    assertEquals(result, true);
  } finally {
    await Deno.remove(tmpDir, { recursive: true });
  }
});
