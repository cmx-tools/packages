import type { CmxNode, SlotPath } from "cmx-contracts";

export type CmxSlotResolverResult = {
  value: unknown;
  slots?: SlotPath[];
};

export type CmxSlotResolver = (node: CmxNode) => CmxSlotResolverResult;

export function resolveCmxSlots(
  owner: unknown,
  slots: SlotPath[] | undefined,
  resolveNode: CmxSlotResolver,
): unknown {
  if (!slots || slots.length === 0) {
    return owner;
  }

  let resolvedOwner = owner;
  for (const slot of slots) {
    const slotValue = readPath(resolvedOwner, slot);
    const resolvedSlot = resolveNode(slotValue as CmxNode);
    resolvedOwner = replacePath(resolvedOwner, slot, resolvedSlot.value);
  }

  return resolvedOwner;
}

function readPath(owner: unknown, path: SlotPath): unknown {
  let value = owner;
  for (const segment of path) {
    value = readChild(value, segment);
  }
  return value;
}

function readChild(owner: unknown, segment: string | number): unknown {
  if (typeof owner !== "object" || owner === null) {
    return undefined;
  }

  return (owner as Record<string | number, unknown>)[segment];
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
