import type {
  CmxDiagnostic,
  CmxDocument,
  CmxDocumentVerificationResult,
  CmxNode,
  CmxVerifyDocument,
} from "cmx-contracts";
import { isCmxDocument } from "cmx-contracts";
import { reduceCmxDocumentNodes } from "cmx-reduce";

export type CmxDocumentNodeVisitor = (
  node: CmxNode,
) =>
  | CmxDiagnostic
  | CmxDiagnostic[]
  | null
  | undefined
  | Promise<CmxDiagnostic | CmxDiagnostic[] | null | undefined>;

type VisitorsArg = [CmxDocumentNodeVisitor[]] | CmxDocumentNodeVisitor[];

export function verifyCmxDocumentNodes(
  ...visitors: VisitorsArg
): CmxVerifyDocument;
export function verifyCmxDocumentNodes(
  document: CmxDocument,
  ...visitors: VisitorsArg
): Promise<CmxDocumentVerificationResult>;
export function verifyCmxDocumentNodes(
  ...input: [CmxDocument, ...VisitorsArg] | VisitorsArg
): CmxVerifyDocument | Promise<CmxDocumentVerificationResult> {
  if (isCmxDocument(input[0])) {
    const [document, ...rest] = input as [CmxDocument, ...VisitorsArg];
    return runVisitors(document, flattenVisitors(rest));
  }

  const visitors = flattenVisitors(input as VisitorsArg);
  return async (document) => runVisitors(document, visitors);
}

async function runVisitors(
  document: CmxDocument,
  visitors: CmxDocumentNodeVisitor[],
): Promise<CmxDocumentVerificationResult> {
  const reduction = await reduceCmxDocumentNodes({
    document,
    context: [] as CmxDiagnostic[],
    async reduceNode(node, diagnostics) {
      for (const visitor of visitors) {
        const result = await visitor(node);
        if (result === null || result === undefined) {
          continue;
        }

        if (Array.isArray(result)) {
          diagnostics.push(...result);
          continue;
        }

        diagnostics.push(result);
      }

      return node;
    },
  });

  if (reduction.context.length === 0) {
    return { valid: true };
  }

  return {
    valid: false,
    diagnostics: reduction.context,
  };
}

function flattenVisitors(input: VisitorsArg): CmxDocumentNodeVisitor[] {
  if (input.length === 1 && Array.isArray(input[0])) {
    return [...input[0]];
  }

  return input as CmxDocumentNodeVisitor[];
}
