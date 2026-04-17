export function normalizePath(path: string): string {
  return path.replaceAll("\\", "/").replace(/\/+/g, "/");
}

export function joinPath(...parts: readonly string[]): string {
  const filtered = parts
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".");

  if (filtered.length === 0) return ".";

  const joined = filtered.join("/");
  return normalizePath(joined);
}

export function dirname(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  if (index < 0) return ".";
  if (index === 0) return "/";
  return normalized.slice(0, index);
}

export function basename(path: string): string {
  const normalized = normalizePath(path);
  const index = normalized.lastIndexOf("/");
  return index < 0 ? normalized : normalized.slice(index + 1);
}

export function extname(path: string): string {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index < 0 ? "" : name.slice(index);
}

export function stripExtension(path: string): string {
  const extension = extname(path);
  return extension.length === 0 ? path : path.slice(0, -extension.length);
}

export function isWithin(parent: string, child: string): boolean {
  const base = normalizePath(parent).replace(/\/+$/, "");
  const value = normalizePath(child);
  return value === base || value.startsWith(`${base}/`);
}
