import { CmxError } from "@cmx-tools/contracts";
import type { CmxPublicationDiagnostics } from "./publicationProtocol/index.js";

export class CmxPublicationError extends CmxError {
  override name = "CmxPublicationError";
  readonly status?: number;
  readonly diagnostics?: CmxPublicationDiagnostics;

  constructor(
    message: string,
    options: {
      status?: number;
      diagnostics?: CmxPublicationDiagnostics;
      cause?: unknown;
    } = {},
  ) {
    super(message, { cause: options.cause });
    this.status = options.status;
    this.diagnostics = options.diagnostics;
  }
}
