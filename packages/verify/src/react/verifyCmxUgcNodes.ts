import type { CmxDiagnostic, CmxNode } from "@cmx-tools/contracts";
import {
  reportCmxUgcDiagnostic,
  createCmxUgcVerificationContext,
} from "./CmxUgcVerificationContext.js";
import { verifyCmxUgcProps } from "./verifyCmxUgcProps.js";

export function verifyCmxUgcNodes(
  node: CmxNode,
  allowedElements: ReadonlySet<string>,
): CmxDiagnostic[] {
  if (node === null || typeof node !== "object" || node.type !== "element") {
    return [];
  }

  const context = createCmxUgcVerificationContext();
  if (!allowedElements.has(node.tag)) {
    reportCmxUgcDiagnostic(
      context,
      "ugc-disallowed-element",
      ["tag"],
      `Element ${JSON.stringify(node.tag)} is not allowed in UGC.`,
    );
  }
  if (node.props) {
    verifyCmxUgcProps(node.props, context);
  }
  return context.diagnostics;
}
