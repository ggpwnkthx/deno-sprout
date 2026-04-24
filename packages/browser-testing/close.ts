/** Helper to close a resource without propagating errors. */

export async function closeQuietly(
  closable: { close(): Promise<void> } | null,
): Promise<void> {
  if (closable === null) return;

  try {
    await closable.close();
  } catch {
    // Preserve the original test failure.
  }
}
