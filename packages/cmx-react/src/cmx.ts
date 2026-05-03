import { createElement, Fragment, type ReactNode } from "react";
import type {
  CmxDocument,
  CmxComponentNode,
  CmxElementNode,
  CmxEnvironment,
  CmxFragmentNode,
  CmxNode,
} from "cmx-contracts";
import { verifyCmxDocumentEnvironment } from "cmx-contracts";
import { resolveCmxSlots } from "cmx-reduce";
import { CmxReactError } from "./CmxReactError.js";

export type CmxResult<Meta = unknown> = {
  children: ReactNode;
  meta?: Meta;
};

export function cmx<Meta = unknown>(
  document: CmxDocument,
  environment?: CmxEnvironment<Meta>,
): CmxResult<Meta> {
  const verification = verifyCmxDocumentEnvironment(document, environment);
  if (!verification.valid) {
    throw new CmxReactError(verification.diagnostics);
  }

  return {
    children: materializeNode(document.tree, environment),
    ...(document.meta
      ? { meta: materializeMeta(document.meta, environment) as Meta }
      : {}),
  };
}

function materializeMeta(
  meta: NonNullable<CmxDocument["meta"]>,
  environment: CmxEnvironment | undefined,
): unknown {
  return resolveCmxSlots(meta.data, meta.slots, (slotNode) => ({
    value: materializeNode(slotNode, environment),
  }));
}

function materializeNode(
  node: CmxNode,
  environment: CmxEnvironment | undefined,
): ReactNode {
  if (
    node === null ||
    typeof node === "boolean" ||
    typeof node === "number" ||
    typeof node === "string"
  ) {
    return node;
  }

  if (node.type === "fragment") {
    return materializeFragment(node, environment);
  }

  if (node.type === "element") {
    return materializeElement(node, environment);
  }

  if (node.type === "component") {
    return materializeComponent(node, environment);
  }

  throw new Error("CMX component nodes are not supported yet.");
}

function materializeFragment(
  node: CmxFragmentNode,
  environment: CmxEnvironment | undefined,
): ReactNode {
  return createElement(
    Fragment,
    undefined,
    ...materializeChildren(node, environment),
  );
}

function materializeElement(
  node: CmxElementNode,
  environment: CmxEnvironment | undefined,
): ReactNode {
  return createElement(
    node.tag,
    materializeProps(node, environment),
    ...materializeChildren(node, environment),
  );
}

function materializeComponent(
  node: CmxComponentNode,
  environment: CmxEnvironment | undefined,
): ReactNode {
  const component = environment?.imports[node.from]?.[node.import ?? "default"];

  return createElement(
    component as never,
    materializeProps(node, environment),
    ...materializeChildren(node, environment),
  );
}

function materializeProps(
  node: CmxElementNode | CmxComponentNode,
  environment: CmxEnvironment | undefined,
): Record<string, unknown> | undefined {
  if (!node.props) {
    return undefined;
  }

  return resolveCmxSlots(node.props, node.slots, (slotNode) => ({
    value: materializeNode(slotNode, environment),
  })) as Record<string, unknown>;
}

function materializeChildren(
  node: CmxFragmentNode | CmxElementNode | CmxComponentNode,
  environment: CmxEnvironment | undefined,
): ReactNode[] {
  return (
    node.children?.map((child) => materializeNode(child, environment)) ?? []
  );
}
