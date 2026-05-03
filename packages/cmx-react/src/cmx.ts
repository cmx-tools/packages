import { createElement, Fragment, type ReactNode } from "react";
import type {
  CmxDocument,
  CmxElementNode,
  CmxEnvironment,
  CmxFragmentNode,
  CmxNode,
} from "cmx-contracts";

export type CmxResult<Meta = unknown> = {
  children: ReactNode;
  meta?: Meta;
};

export function cmx<Meta = unknown>(
  document: CmxDocument,
  _environment?: CmxEnvironment<Meta>,
): CmxResult<Meta> {
  return {
    children: materializeNode(document.tree),
    ...(document.meta ? { meta: document.meta.data as Meta } : {}),
  };
}

function materializeNode(node: CmxNode): ReactNode {
  if (
    node === null ||
    typeof node === "boolean" ||
    typeof node === "number" ||
    typeof node === "string"
  ) {
    return node;
  }

  if (node.type === "fragment") {
    return materializeFragment(node);
  }

  if (node.type === "element") {
    return materializeElement(node);
  }

  throw new Error("CMX component nodes are not supported yet.");
}

function materializeFragment(node: CmxFragmentNode): ReactNode {
  return createElement(Fragment, undefined, ...materializeChildren(node));
}

function materializeElement(node: CmxElementNode): ReactNode {
  return createElement(node.tag, node.props, ...materializeChildren(node));
}

function materializeChildren(
  node: CmxFragmentNode | CmxElementNode,
): ReactNode[] {
  return node.children?.map(materializeNode) ?? [];
}
