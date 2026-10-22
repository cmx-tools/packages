import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CmxAssetJson, CmxAssetProcessor } from "@cmx-tools/contracts";
import { normalizeCmxAssetData } from "./normalizeCmxAssetData.js";

const CMX_ASSET_CACHE_VERSION = 2;

export function cmxAssetCacheKey(
  bytes: Uint8Array,
  name: string,
  identity: string,
  processor: CmxAssetProcessor,
): string {
  if (typeof processor.version !== "string" || !processor.version.trim())
    throw new Error("Asset processors require a nonempty cache version");
  const options =
    processor.options === undefined
      ? ["absent"]
      : ["configured", canonicalOptions(processor.options)];
  return hash(
    Buffer.from(
      JSON.stringify([
        CMX_ASSET_CACHE_VERSION,
        hash(bytes),
        name,
        identity,
        processor.version,
        options,
      ]),
    ),
  );
}

export async function processCmxAsset(
  bytes: Uint8Array,
  name: string,
  processor: CmxAssetProcessor,
  cacheDirectory: string,
): Promise<CmxAssetJson> {
  const cached = await readCached(cacheDirectory);
  if (cached !== undefined) return cached;
  const result = await processor.process({
    bytes: Uint8Array.from(bytes),
    name,
    options: structuredClone(processor.options),
  });
  const data = normalizeCmxAssetData(result);
  const temporary = `${cacheDirectory}-${randomUUID()}`;
  await mkdir(temporary, { recursive: true });
  try {
    await writeFile(
      path.join(temporary, "metadata.json"),
      JSON.stringify({ data }),
    );
    try {
      await rename(temporary, cacheDirectory);
    } catch (error) {
      if (
        !["EEXIST", "ENOTEMPTY"].includes(
          (error as NodeJS.ErrnoException).code ?? "",
        )
      )
        throw error;
      const winner = await readCached(cacheDirectory);
      if (winner === undefined)
        throw new Error("Asset processing cache is incomplete");
      return winner;
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return data;
}

async function readCached(
  directory: string,
): Promise<CmxAssetJson | undefined> {
  const serialized = await readFile(
    path.join(directory, "metadata.json"),
    "utf8",
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (serialized === undefined) return;
  return normalizeCmxAssetData(
    (JSON.parse(serialized) as { data: unknown }).data,
  );
}

function hash(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function canonicalOptions(
  value: unknown,
  ancestors = new Set<object>(),
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  )
    return value;
  if (typeof value !== "object" || ancestors.has(value))
    throw new Error("Asset processing options must be JSON values");
  if (
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) !== Object.prototype &&
    Object.getPrototypeOf(value) !== null
  )
    throw new Error("Asset processing options must contain plain objects");
  const next = new Set(ancestors).add(value);
  if (Array.isArray(value))
    return Array.from(value, (item) => canonicalOptions(item, next));
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [
        key,
        canonicalOptions((value as Record<string, unknown>)[key], next),
      ]),
  );
}
