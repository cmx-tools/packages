import type { CmxPublicationDelta } from "@cmx-tools/publish";

const hashPattern = /^sha256:[0-9a-f]{64}$/;

export async function readCmxPublicationDelta(
  request: Request,
): Promise<CmxPublicationDelta | undefined> {
  let value: unknown;
  try {
    value = JSON.parse(await request.text(), (_key, item: unknown) => {
      if (typeof item === "number" && !Number.isFinite(item)) {
        throw new TypeError("Publication numbers must be finite.");
      }
      return item;
    });
  } catch {
    return undefined;
  }
  if (
    !isRecord(value) ||
    !isHash(value.baseContentHash) ||
    !isHash(value.targetContentHash) ||
    !isRecord(value.upsert) ||
    !Array.isArray(value.remove) ||
    !value.remove.every((name) => typeof name === "string") ||
    new Set(value.remove).size !== value.remove.length ||
    value.remove.some((name) => Object.hasOwn(value.upsert as object, name))
  )
    return undefined;
  return value as CmxPublicationDelta;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && hashPattern.test(value);
}
