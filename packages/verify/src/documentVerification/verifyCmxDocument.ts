import type { CmxDiagnostic, CmxDocument } from "@cmx-tools/contracts";
import { createCmxVerificationContext } from "./CmxVerificationContext.js";
import { verifyCmxDocumentShape } from "./verifyCmxDocumentShape.js";
import { verifyCmxNodeShapes } from "./verifyCmxNodeShapes.js";

export type VerifyCmxDocumentResult =
  | { valid: true; document: CmxDocument }
  | { valid: false; diagnostics: CmxDiagnostic[] };

export function verifyCmxDocument(document: unknown): VerifyCmxDocumentResult {
  const context = createCmxVerificationContext();
  if (verifyCmxDocumentShape(document, context)) {
    verifyCmxNodeShapes(document as CmxDocument, context);
  }
  return context.diagnostics.length === 0
    ? { valid: true, document: document as CmxDocument }
    : { valid: false, diagnostics: context.diagnostics };
}
