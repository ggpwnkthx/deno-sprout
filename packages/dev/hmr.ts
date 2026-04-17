// hmr.ts - Hot Module Replacement
export interface WatchFilesResult {
  close: () => void;
}

export function watchFiles(
  _files: string[],
  _callback: (file: string) => void,
): WatchFilesResult {
  return {
    close: () => {},
  };
}
