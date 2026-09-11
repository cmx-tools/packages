import { CmxError, type CmxDiagnostic } from "@cmx-tools/contracts";

export class ReactUgcError extends CmxError {
  readonly diagnostics: CmxDiagnostic[];

  constructor(diagnostics: CmxDiagnostic[]) {
    super("CMX document failed React UGC policy.");
    this.name = "ReactUgcError";
    this.diagnostics = diagnostics;
  }
}
