import {
  CmxError,
  type CmxDocumentEnvironmentVerificationDiagnostic,
} from "@cmx-tools/contracts";

export class CmxReactError extends CmxError {
  readonly diagnostics: CmxDocumentEnvironmentVerificationDiagnostic[];

  constructor(diagnostics: CmxDocumentEnvironmentVerificationDiagnostic[]) {
    super("CMX document failed contract verification.");
    this.name = "CmxReactError";
    this.diagnostics = diagnostics;
  }
}
