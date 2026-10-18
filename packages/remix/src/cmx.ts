import {
  createElement,
  Fragment,
  type RemixNode,
  type ElementType,
} from "remix/component";
import { jsx } from "remix/component/jsx-runtime";
import type {
  CmxDocument,
  CmxComponentNode,
  CmxElementNode,
  CmxEnvironment,
  CmxFragmentNode,
  CmxNode,
} from "@cmx-tools/contracts";
import { CmxError, verifyCmxDocumentEnvironment } from "@cmx-tools/contracts";
import { resolveCmxSlots } from "@cmx-tools/reduce";
import { CmxRemixError } from "./CmxRemixError.js";

type CmxHydratableNode = CmxFragmentNode | CmxElementNode | CmxComponentNode;

export type HydratedCmxExportValue<T> = T extends CmxHydratableNode
  ? RemixNode
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
    throw new CmxRemixError(verification.diagnostics);
  }

  return Object.fromEntries(
    Object.entries(document.content).map(([name, value]) => [
      name,
      resolveCmxSlots(
        value,
        document.interface.exports[name]?.slots,
        (node) => ({
          value: hydrateNode(node, environment),
        }),
      ),
    ]),
  ) as HydratedCmxExports<Exports>;
}

function hydrateNode(
  node: CmxNode,
  environment: CmxEnvironment | undefined,
): RemixNode {
  if (node === null || typeof node !== "object") {
    return node;
  }

  if (node.type === "fragment") {
    return createElement(
      Fragment,
      undefined,
      ...(node.children?.map((child) => hydrateNode(child, environment)) ?? []),
    );
  }

  const props = resolveCmxSlots(node.props, node.slots, (slotNode) => ({
    value: hydrateNode(slotNode, environment),
  })) as Record<string, unknown> | undefined;
  const children =
    node.children?.map((child) => hydrateNode(child, environment)) ?? [];
  let type: unknown = node.type === "element" ? node.tag : undefined;
  if (node.type === "component") {
    const imports =
      environment && Object.hasOwn(environment.imports, node.from)
        ? environment.imports[node.from]
        : undefined;
    const importName = node.import ?? "default";
    if (imports && Object.hasOwn(imports, importName)) {
      type = imports[importName];
    }
    if (!type) {
      throw new CmxError(
        `CMX import binding missing: ${node.from}#${importName}`,
      );
    }
  }

  const { key, ...elementProps } = props ?? {};
  return jsx(
    type as ElementType,
    {
      ...elementProps,
      ...(children.length > 0 ? { children } : {}),
    },
    key,
  );
}
