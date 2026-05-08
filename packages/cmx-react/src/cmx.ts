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
  environment?: CmxEnvironment,
): CmxResult<Meta> {
  const verification = verifyCmxDocumentEnvironment(document, environment);
  if (!verification.valid) {
    throw new CmxReactError(verification.diagnostics);
  }

  return {
    children: hydrateExport(document, "default", environment) as ReactNode,
  };
}

function hydrateExport(
  document: CmxDocument,
  name: string,
  environment: CmxEnvironment | undefined,
): unknown {
  return resolveCmxSlots(
    document.content[name],
    document.interface.exports[name]?.slots,
    (slotNode) => ({
      value: hydrateNode(slotNode, environment),
    }),
  );
}

function hydrateNode(
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
    return hydrateFragment(node, environment);
  }

  if (node.type === "element") {
    return hydrateElement(node, environment);
  }

  if (node.type === "component") {
    return hydrateComponent(node, environment);
  }

  throw new Error("CMX component nodes are not supported yet.");
}

function hydrateFragment(
  node: CmxFragmentNode,
  environment: CmxEnvironment | undefined,
): ReactNode {
  return createElement(
    Fragment,
    undefined,
    ...hydrateChildren(node, environment),
  );
}

function hydrateElement(
  node: CmxElementNode,
  environment: CmxEnvironment | undefined,
): ReactNode {
  return createElement(
    node.tag,
    hydrateProps(node, environment),
    ...hydrateChildren(node, environment),
  );
}

function hydrateComponent(
  node: CmxComponentNode,
  environment: CmxEnvironment | undefined,
): ReactNode {
  const component = environment?.imports[node.from]?.[node.import ?? "default"];

  return createElement(
    component as never,
    hydrateProps(node, environment),
    ...hydrateChildren(node, environment),
  );
}

function hydrateProps(
  node: CmxElementNode | CmxComponentNode,
  environment: CmxEnvironment | undefined,
): Record<string, unknown> | undefined {
  if (!node.props) {
    return undefined;
  }

  return resolveCmxSlots(node.props, node.slots, (slotNode) => ({
    value: hydrateNode(slotNode, environment),
  })) as Record<string, unknown>;
}

function hydrateChildren(
  node: CmxFragmentNode | CmxElementNode | CmxComponentNode,
  environment: CmxEnvironment | undefined,
): ReactNode[] {
  return node.children?.map((child) => hydrateNode(child, environment)) ?? [];
}
