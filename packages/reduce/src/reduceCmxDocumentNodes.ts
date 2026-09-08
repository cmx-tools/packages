import type { CmxDocument, CmxNode, SlotPath } from "@cmx-tools/contracts";

export type CmxNodeReducer<Context> = (
  node: CmxNode,
  context: Context,
) => CmxNode | Promise<CmxNode>;

export type ReduceCmxDocumentNodesInput<Context> = {
  document: CmxDocument;
  context: Context;
  reduceNode: CmxNodeReducer<Context>;
};

export type ReduceCmxDocumentNodesResult<Context> = {
  document: CmxDocument;
  context: Context;
};

export async function reduceCmxDocumentNodes<Context>(
  input: ReduceCmxDocumentNodesInput<Context>,
): Promise<ReduceCmxDocumentNodesResult<Context>> {
  const content: Record<string, unknown> = { ...input.document.content };

  for (const [exportName, exportDeclaration] of Object.entries(
    input.document.interface.exports,
  )) {
    const exportValue = content[exportName];
    content[exportName] = await reduceExportValue(
      exportValue,
      exportDeclaration.slots,
      input.reduceNode,
      input.context,
    );
  }

  return {
    document: {
      ...input.document,
      content,
    },
    context: input.context,
  };
}

async function reduceExportValue<Context>(
  value: unknown,
  slots: SlotPath[] | undefined,
  reduceNode: CmxNodeReducer<Context>,
  context: Context,
): Promise<unknown> {
  if (!slots || slots.length === 0) {
    return value;
  }

  let resolved = value;
  for (const slotPath of slots) {
    const slotValue = readPath(resolved, slotPath);
    if (slotValue == null) {
      continue;
    }
    const reducedNode = await reduceDocumentNode(
      slotValue as CmxNode,
      reduceNode,
      context,
    );
    resolved = replacePath(resolved, slotPath, reducedNode);
  }

  return resolved;
}

async function reduceDocumentNode<Context>(
  node: CmxNode,
  reduceNode: CmxNodeReducer<Context>,
  context: Context,
): Promise<CmxNode> {
  const reducedNode = await reduceNode(node, context);

  if (
    reducedNode === null ||
    typeof reducedNode === "boolean" ||
    typeof reducedNode === "number" ||
    typeof reducedNode === "string"
  ) {
    return reducedNode;
  }

  const withReducedChildren = await reduceChildren(
    reducedNode,
    reduceNode,
    context,
  );
  return reduceSlots(withReducedChildren, reduceNode, context);
}

async function reduceChildren<Context>(
  node: Exclude<CmxNode, null | boolean | number | string>,
  reduceNode: CmxNodeReducer<Context>,
  context: Context,
): Promise<Exclude<CmxNode, null | boolean | number | string>> {
  if (!("children" in node) || !node.children || node.children.length === 0) {
    return node;
  }

  const children: CmxNode[] = [];
  for (const child of node.children) {
    children.push(await reduceDocumentNode(child, reduceNode, context));
  }

  return {
    ...node,
    children,
  };
}

async function reduceSlots<Context>(
  node: Exclude<CmxNode, null | boolean | number | string>,
  reduceNode: CmxNodeReducer<Context>,
  context: Context,
): Promise<Exclude<CmxNode, null | boolean | number | string>> {
  if (
    (node.type !== "element" && node.type !== "component") ||
    !node.props ||
    !node.slots
  ) {
    return node;
  }

  let props: unknown = node.props;
  for (const slotPath of node.slots) {
    const slotValue = readPath(props, slotPath);
    if (slotValue === undefined) {
      continue;
    }
    const reducedSlot = await reduceDocumentNode(
      slotValue as CmxNode,
      reduceNode,
      context,
    );
    props = replacePath(props, slotPath, reducedSlot);
  }

  return {
    ...node,
    props: props as Record<string, unknown>,
  };
}

function readPath(owner: unknown, path: SlotPath): unknown {
  let value = owner;
  for (const segment of path) {
    if (typeof value !== "object" || value === null) {
      return undefined;
    }
    value = (value as Record<string | number, unknown>)[segment];
  }
  return value;
}

function replacePath(owner: unknown, path: SlotPath, value: unknown): unknown {
  if (path.length === 0) {
    return value;
  }

  const [segment, ...rest] = path;
  const clone = cloneContainer(owner);
  clone[segment] = replacePath(clone[segment], rest, value);
  return clone;
}

function cloneContainer(owner: unknown): Record<string | number, unknown> {
  if (Array.isArray(owner)) {
    return owner.slice() as unknown as Record<string | number, unknown>;
  }

  if (typeof owner === "object" && owner !== null) {
    return { ...(owner as Record<string | number, unknown>) };
  }

  return {};
}
