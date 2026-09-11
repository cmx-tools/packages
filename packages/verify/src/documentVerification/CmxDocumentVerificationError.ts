import { CmxError, type CmxDiagnostic } from "@cmx-tools/contracts";

export class CmxDocumentVerificationError extends CmxError {
  readonly diagnostics: CmxDiagnostic[];

  constructor(diagnostics: CmxDiagnostic[]) {
    super("CMX document failed structural verification.");
    this.name = "CmxDocumentVerificationError";
    this.diagnostics = diagnostics;
  }
}
