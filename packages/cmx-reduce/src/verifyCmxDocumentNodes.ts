import type {
  CmxDiagnostic,
  CmxDocument,
  CmxDocumentVerificationResult,
  CmxNode,
  CmxVerifyDocument,
  SlotPath,
} from "cmx-contracts";
import { isCmxDocument } from "cmx-contracts";

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
  const diagnostics: CmxDiagnostic[] = [];
  for (const value of Object.values(document.content)) {
    await walkNode(value as CmxNode, visitors, diagnostics);
  }
  if (diagnostics.length === 0) {
    return { valid: true };
  }
  return { valid: false, diagnostics };
}

async function walkNode(
  node: CmxNode,
  visitors: CmxDocumentNodeVisitor[],
  diagnostics: CmxDiagnostic[],
): Promise<void> {
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

  if (typeof node !== "object" || node === null || !("type" in node)) {
    return;
  }
  if (
    node.type === "fragment" ||
    node.type === "element" ||
    node.type === "component"
  ) {
    for (const child of node.children ?? []) {
      await walkNode(child, visitors, diagnostics);
    }
  }
  if (node.type === "element" || node.type === "component") {
    for (const slotPath of node.slots ?? []) {
      await walkNode(
        readPath(node, slotPath) as CmxNode,
        visitors,
        diagnostics,
      );
    }
  }
}

function readPath(owner: unknown, slotPath: SlotPath): unknown {
  let value = owner;
  for (const segment of slotPath) {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    value = (value as Record<string | number, unknown>)[segment];
  }
  return value;
}

function flattenVisitors(input: VisitorsArg): CmxDocumentNodeVisitor[] {
  if (input.length === 1 && Array.isArray(input[0])) {
    return [...input[0]];
  }
  return input as CmxDocumentNodeVisitor[];
}
