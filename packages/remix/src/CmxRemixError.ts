import {
  CmxError,
  type CmxDocumentEnvironmentVerificationDiagnostic,
} from "@cmx-tools/contracts";

export class CmxRemixError extends CmxError {
  readonly diagnostics: CmxDocumentEnvironmentVerificationDiagnostic[];

  constructor(diagnostics: CmxDocumentEnvironmentVerificationDiagnostic[]) {
    super("CMX document failed contract verification.");
    this.name = "CmxRemixError";
    this.diagnostics = diagnostics;
  }
}
