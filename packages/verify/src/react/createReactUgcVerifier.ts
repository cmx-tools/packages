import type { CmxVerifyDocument } from "@cmx-tools/contracts";
import { verifyCmxDocumentNodes } from "../index.js";
import { contentElements } from "./elementGroups.js";
import { verifyCmxUgcNodes } from "./verifyCmxUgcNodes.js";

export type UgcPolicyOptions = {
  allowedElements?: readonly string[];
};

export function createReactUgcVerifier(
  options: UgcPolicyOptions = {},
): CmxVerifyDocument {
  const allowedElements = new Set(options.allowedElements ?? contentElements);
  return verifyCmxDocumentNodes((node) =>
    verifyCmxUgcNodes(node, allowedElements),
  );
}
