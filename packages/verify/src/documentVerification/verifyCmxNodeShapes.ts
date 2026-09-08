import type { CmxDocument, SlotPath } from "@cmx-tools/contracts";
import {
  type CmxValuePath,
  type CmxVerificationContext,
  isCmxRecord,
  reportCmxDiagnostic,
} from "./CmxVerificationContext.js";
import { verifyCmxSlotPaths } from "./verifyCmxDocumentShape.js";

type NodeVisit = {
  action: "visit";
  node: unknown;
  path: CmxValuePath;
};

type PendingNode = NodeVisit | { action: "leave"; node: object };

export function verifyCmxNodeShapes(
  document: CmxDocument,
  context: CmxVerificationContext,
): void {
  const pending: PendingNode[] = [];
  const active = new WeakSet<object>();
  const exportEntries = Object.entries(document.interface.exports);
  for (const [name, declaration] of exportEntries.reverse()) {
    for (const slotPath of [...(declaration.slots ?? [])].reverse()) {
      const resolved = readOwnPath(document.content[name], slotPath);
      if (!resolved.found) {
        reportCmxDiagnostic(
          context,
          "invalid-document",
          ["content", name, ...slotPath],
          "Export slot does not resolve to a value.",
        );
        continue;
      }
      pending.push({
        action: "visit",
        node: resolved.value,
        path: ["content", name, ...slotPath],
      });
    }
  }

  while (pending.length > 0) {
    const current = pending.pop();
    if (!current) {
      continue;
    }
    if (current.action === "leave") {
      active.delete(current.node);
      continue;
    }
    if (isCmxRecord(current.node)) {
      if (active.has(current.node)) {
        reportCmxDiagnostic(
          context,
          "invalid-node",
          current.path,
          "CMX nodes must not contain cycles.",
        );
        continue;
      }
      active.add(current.node);
      pending.push({ action: "leave", node: current.node });
    }
    verifyNode(document, current.node, current.path, pending, context);
  }
}

function verifyNode(
  document: CmxDocument,
  node: unknown,
  path: CmxValuePath,
  pending: PendingNode[],
  context: CmxVerificationContext,
): void {
  if (
    node === null ||
    typeof node === "string" ||
    typeof node === "boolean" ||
    (typeof node === "number" && Number.isFinite(node))
  ) {
    return;
  }
  if (!isCmxRecord(node)) {
    reportCmxDiagnostic(
      context,
      "invalid-node",
      path,
      "CMX node has an invalid shape.",
    );
    return;
  }

  if (node.type === "fragment") {
    addChildren(node.children, path, pending, context);
    return;
  }

  if (node.type !== "element" && node.type !== "component") {
    reportCmxDiagnostic(
      context,
      "invalid-node",
      [...path, "type"],
      "CMX node type is invalid.",
    );
    return;
  }

  if (node.type === "element") {
    verifyElement(node, path, context);
  } else {
    verifyComponent(document, node, path, context);
  }

  const props = node.props;
  if (props !== undefined) {
    if (!isCmxRecord(props)) {
      reportCmxDiagnostic(
        context,
        "invalid-node",
        [...path, "props"],
        "CMX node props must be an object.",
      );
    } else {
      addPropSlots(node.slots, props, path, pending, context);
    }
  } else if (node.slots !== undefined) {
    reportCmxDiagnostic(
      context,
      "invalid-node",
      [...path, "slots"],
      "CMX node slots require props.",
    );
  }

  addChildren(node.children, path, pending, context);
}

function verifyElement(
  node: Record<string, unknown>,
  path: CmxValuePath,
  context: CmxVerificationContext,
): void {
  if (typeof node.tag !== "string" || node.tag.length === 0) {
    reportCmxDiagnostic(
      context,
      "invalid-node",
      [...path, "tag"],
      "CMX element tag must be a non-empty string.",
    );
    return;
  }
}

function verifyComponent(
  document: CmxDocument,
  node: Record<string, unknown>,
  path: CmxValuePath,
  context: CmxVerificationContext,
): void {
  if (
    typeof node.from !== "string" ||
    node.from.length === 0 ||
    (node.import !== undefined &&
      (typeof node.import !== "string" || node.import.length === 0))
  ) {
    reportCmxDiagnostic(
      context,
      "invalid-node",
      path,
      "CMX component reference is invalid.",
    );
    return;
  }

  const packageName = packageNameFromImportRef(node.from);
  if (
    packageName === undefined ||
    !Object.hasOwn(document.interface.imports, packageName)
  ) {
    reportCmxDiagnostic(
      context,
      "undeclared-component",
      [...path, "from"],
      `Component ${JSON.stringify(node.from)} is not declared by the Document Interface.`,
    );
  }
}

function addPropSlots(
  value: unknown,
  props: Record<string, unknown>,
  path: CmxValuePath,
  pending: PendingNode[],
  context: CmxVerificationContext,
): void {
  if (value === undefined) {
    return;
  }
  const slotsPath = [...path, "slots"];
  if (!verifyCmxSlotPaths(value, slotsPath, context)) {
    return;
  }
  for (const slotPath of [...value].reverse()) {
    const resolved = readOwnPath(props, slotPath);
    if (!resolved.found) {
      reportCmxDiagnostic(
        context,
        "invalid-node",
        [...path, "props", ...slotPath],
        "Node prop slot does not resolve to a value.",
      );
      continue;
    }
    pending.push({
      action: "visit",
      node: resolved.value,
      path: [...path, "props", ...slotPath],
    });
  }
}

function addChildren(
  value: unknown,
  path: CmxValuePath,
  pending: PendingNode[],
  context: CmxVerificationContext,
): void {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    reportCmxDiagnostic(
      context,
      "invalid-node",
      [...path, "children"],
      "CMX node children must be an array.",
    );
    return;
  }
  for (let index = value.length - 1; index >= 0; index -= 1) {
    pending.push({
      action: "visit",
      node: value[index],
      path: [...path, "children", index],
    });
  }
}

function readOwnPath(
  owner: unknown,
  path: SlotPath,
): { found: true; value: unknown } | { found: false } {
  let value = owner;
  for (const segment of path) {
    if (!isCmxRecord(value) && !Array.isArray(value)) {
      return { found: false };
    }
    if (!Object.hasOwn(value, segment)) {
      return { found: false };
    }
    value = value[segment as keyof typeof value];
  }
  return { found: true, value };
}

function packageNameFromImportRef(from: string): string | undefined {
  if (from.startsWith(".") || from.startsWith("/")) {
    return undefined;
  }
  const [first, second] = from.split("/");
  if (!first) {
    return undefined;
  }
  if (first.startsWith("@")) {
    return second ? `${first}/${second}` : undefined;
  }
  return first;
}
