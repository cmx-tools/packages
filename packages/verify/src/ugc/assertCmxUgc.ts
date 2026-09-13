import type { CmxDocument } from "@cmx-tools/contracts";
import {
  createCmxUgcVerifier,
  type UgcPolicyOptions,
} from "./createCmxUgcVerifier.js";
import { CmxUgcError } from "./CmxUgcError.js";

export async function assertCmxUgc(
  document: CmxDocument,
  options: UgcPolicyOptions = {},
): Promise<void> {
  const result = await createCmxUgcVerifier(options)(document);
  if (!result.valid) {
    throw new CmxUgcError(result.diagnostics);
  }
}
