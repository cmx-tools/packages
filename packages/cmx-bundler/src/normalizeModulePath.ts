import { realpathSync } from "node:fs";
import path from "node:path";

export function normalizeModulePath(filePath: string): string {
  if (filePath.includes("\0")) {
    return filePath;
  }
  const resolved = path.resolve(filePath);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}
