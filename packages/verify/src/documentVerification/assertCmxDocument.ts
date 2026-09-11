import type { CmxDocument } from "@cmx-tools/contracts";
import { verifyCmxDocument } from "./verifyCmxDocument.js";
import { CmxDocumentVerificationError } from "./CmxDocumentVerificationError.js";

export function assertCmxDocument(
  value: unknown,
): asserts value is CmxDocument {
  const result = verifyCmxDocument(value);
  if (!result.valid) {
    throw new CmxDocumentVerificationError(result.diagnostics);
  }
}
