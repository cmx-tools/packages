import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  CmxAssetFile,
  CmxAssetProcessor,
  CmxStoredAssetFile,
} from "@cmx-tools/contracts";
import { mapCmxAssetData } from "./mapCmxAssetData.js";
import { validateCmxAssetFile } from "./validateCmxAssetFile.js";

export type ProcessedCmxAsset = {
  data: unknown;
  files: Map<string, CmxStoredAssetFile>;
};

export function cmxAssetCacheKey(
  bytes: Uint8Array,
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
      JSON.stringify([1, hash(bytes), identity, processor.version, options]),
    ),
  );
}

export async function processCmxAsset(
  bytes: Uint8Array,
  processor: CmxAssetProcessor,
  cacheDirectory: string,
): Promise<ProcessedCmxAsset> {
  const cached = await readCached(cacheDirectory);
  if (cached) return cached;
  const files = new Map<string, CmxStoredAssetFile>();
  const emit = (output: Uint8Array, extension: string): CmxAssetFile => {
    const normalized = extension.startsWith(".")
      ? extension.toLowerCase()
      : `.${extension.toLowerCase()}`;
    if (!/^\.[a-z0-9]+$/.test(normalized))
      throw new Error(`Invalid asset extension: ${extension}`);
    const copy = Uint8Array.from(output);
    const key = hash(copy) + normalized;
    files.set(key, { key, bytes: copy });
    return { $cmxAsset: key };
  };
  const result = await processor.process({
    bytes: Uint8Array.from(bytes),
    options: structuredClone(processor.options),
    file: (extension) => emit(bytes, extension),
    emit,
  });
  const data = await mapCmxAssetData(result, (reference) => {
    if (!files.has(reference.$cmxAsset))
      throw new Error("Processor returned an unknown asset file");
    return reference;
  });
  const temporary = `${cacheDirectory}-${randomUUID()}`;
  await mkdir(temporary, { recursive: true });
  try {
    await Promise.all(
      [...files.values()].map((file) =>
        writeFile(path.join(temporary, file.key), file.bytes),
      ),
    );
    await writeFile(
      path.join(temporary, "metadata.json"),
      JSON.stringify({ data, files: [...files.keys()] }),
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
      if (!winner) throw new Error("Asset processing cache is incomplete");
      return winner;
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
  return { data, files };
}

async function readCached(
  directory: string,
): Promise<ProcessedCmxAsset | undefined> {
  const serialized = await readFile(
    path.join(directory, "metadata.json"),
    "utf8",
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (serialized === undefined) return;
  const cached = JSON.parse(serialized) as { data: unknown; files: string[] };
  const files = new Map<string, CmxStoredAssetFile>();
  for (const key of cached.files) {
    if (!/^[a-f0-9]{64}\.[a-z0-9]+$/.test(key))
      throw new Error("Invalid cached asset key");
    const file = { key, bytes: await readFile(path.join(directory, key)) };
    validateCmxAssetFile(file);
    files.set(key, file);
  }
  await mapCmxAssetData(cached.data, (reference) => {
    if (!files.has(reference.$cmxAsset))
      throw new Error("Cached asset file is missing");
    return reference;
  });
  return { data: cached.data, files };
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
