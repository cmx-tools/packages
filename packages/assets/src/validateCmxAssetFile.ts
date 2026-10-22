import { createHash } from "node:crypto";
import type { CmxStoredAssetFile } from "@cmx-tools/contracts";

export function validateCmxAssetFile(file: CmxStoredAssetFile): void {
  const hash = createHash("sha256").update(file.bytes).digest("hex");
  if (!new RegExp(`^${hash}\\.[a-z0-9]+$`).test(file.key)) {
    throw new Error(`Invalid content-hashed asset key: ${file.key}`);
  }
}
