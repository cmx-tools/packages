import { CmxError, type CmxDiagnostic } from "@cmx-tools/contracts";

export class CmxUgcError extends CmxError {
  readonly diagnostics: CmxDiagnostic[];

  constructor(diagnostics: CmxDiagnostic[]) {
    super("CMX document failed UGC policy.");
    this.name = "CmxUgcError";
    this.diagnostics = diagnostics;
  }
}
