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

type CmxHydratableNode = CmxFragmentNode | CmxElementNode | CmxComponentNode;

export type HydratedCmxExportValue<T> = T extends CmxHydratableNode
  ? ReactNode
  : T extends readonly (infer Item)[]
    ? HydratedCmxExportValue<Item>[]
    : T extends Record<string, unknown>
      ? { [Key in keyof T]: HydratedCmxExportValue<T[Key]> }
      : T;

export type HydratedCmxExports<Exports extends Record<string, unknown>> = {
  [Key in keyof Exports]: HydratedCmxExportValue<Exports[Key]>;
};

export function cmx<
  Exports extends Record<string, unknown> = Record<string, unknown>,
>(
  document: CmxDocument,
  environment?: CmxEnvironment<Exports>,
): HydratedCmxExports<Exports> {
  const verification = verifyCmxDocumentEnvironment(document, environment);
  if (!verification.valid) {
    throw new CmxReactError(verification.diagnostics);
  }

  return Object.fromEntries(
    Object.keys(document.content).map((name) => [
      name,
      hydrateExport(document, name, environment),
    ]),
  ) as HydratedCmxExports<Exports>;
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
  const importName = node.import ?? "default";
  const component = environment?.imports[node.from]?.[importName];
  if (!component) {
    throw new Error(`CMX import binding missing: ${node.from}#${importName}`);
  }

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
