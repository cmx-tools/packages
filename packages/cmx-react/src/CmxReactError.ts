import type { CmxDocumentEnvironmentVerificationDiagnostic } from "cmx-contracts";

export class CmxReactError extends Error {
  readonly diagnostics: CmxDocumentEnvironmentVerificationDiagnostic[];

  constructor(diagnostics: CmxDocumentEnvironmentVerificationDiagnostic[]) {
    super("CMX document failed contract verification.");
    this.name = "CmxReactError";
    this.diagnostics = diagnostics;
  }
}
