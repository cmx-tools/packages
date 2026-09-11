import type { CmxDocument } from "@cmx-tools/contracts";
import {
  createReactUgcVerifier,
  type UgcPolicyOptions,
} from "./createReactUgcVerifier.js";
import { ReactUgcError } from "./ReactUgcError.js";

export async function assertReactUgc(
  document: CmxDocument,
  options: UgcPolicyOptions = {},
): Promise<void> {
  const result = await createReactUgcVerifier(options)(document);
  if (!result.valid) {
    throw new ReactUgcError(result.diagnostics);
  }
}
