import type { CmxAssetJson } from "@cmx-tools/contracts";

export function normalizeCmxAssetData(
  value: unknown,
  ancestors = new Set<object>(),
): CmxAssetJson {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  if (typeof value !== "object" || ancestors.has(value))
    throw new Error("Asset metadata must be representable as Document Content");
  if (
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null &&
    !Array.isArray(value)
  )
    throw new Error("Asset metadata must contain plain objects");
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value))
    return Array.from(value, (item) => normalizeCmxAssetData(item, next));
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .map(([key, item]) => [key, normalizeCmxAssetData(item, next)]),
  );
}
