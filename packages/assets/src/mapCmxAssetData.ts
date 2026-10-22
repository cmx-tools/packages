import type { CmxAssetFile } from "@cmx-tools/contracts";

export async function mapCmxAssetData(
  value: unknown,
  resolve: (file: CmxAssetFile) => unknown,
  ancestors = new Set<object>(),
): Promise<unknown> {
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
  if ("$cmxAsset" in value) {
    if (Object.keys(value).length !== 1 || typeof value.$cmxAsset !== "string")
      throw new Error("Invalid asset file reference");
    return resolve(value as CmxAssetFile);
  }
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value))
    return Promise.all(
      Array.from(value, (item) => mapCmxAssetData(item, resolve, next)),
    );
  return Object.fromEntries(
    await Promise.all(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(async ([key, item]) => [
          key,
          await mapCmxAssetData(item, resolve, next),
        ]),
    ),
  );
}
