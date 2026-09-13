import type { CmxVerifyDocument } from "@cmx-tools/contracts";
import { verifyCmxDocumentNodes } from "../index.js";
import type { CmxUgcPolicy } from "./CmxUgcPolicy.js";
import { contentElements } from "./elementGroups.js";
import { verifyCmxUgcNodes } from "./verifyCmxUgcNodes.js";

export type UgcPolicyOptions = {
  allowedElements?: readonly string[];
  policy?: CmxUgcPolicy;
};

export function createCmxUgcVerifier(
  options: UgcPolicyOptions = {},
): CmxVerifyDocument {
  const allowedElements = new Set(options.allowedElements ?? contentElements);
  const additionalDisallowedProps = new Set(
    options.policy?.disallowedProps.map((name) => name.toLowerCase()),
  );
  return verifyCmxDocumentNodes((node) =>
    verifyCmxUgcNodes(node, allowedElements, additionalDisallowedProps),
  );
}
