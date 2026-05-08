import type { InputOptions, OutputBundle, OutputChunk } from "rolldown";
import {
  CMX_BUNDLE_VERSION,
  type CmxBundle,
  type CmxBundleChunk,
  type CmxDependency,
  type CmxExportConfig,
  type UnverifiedOptionalExportsPolicy,
  type UnsupportedValuesPolicy,
} from "cmx-contracts";
import { normalizeModulePath } from "./normalizeModulePath.js";

export function createEntryOrder(
  input: InputOptions["input"],
): Map<string, number> {
  const entries =
    typeof input === "string"
      ? [input]
      : Array.isArray(input)
        ? input
        : input
          ? Object.values(input)
          : [];

  return new Map(
    entries.map((entry, index) => [normalizeModulePath(String(entry)), index]),
  );
}

export function isEntryModule(
  moduleId: string,
  entryOrder: Map<string, number>,
) {
  return entryOrder.has(moduleId);
}

export function createCmxBundleArtifact(input: {
  outputBundle: OutputBundle;
  entryOrder: Map<string, number>;
  runtimeImportSource: string;
  exports: Record<string, CmxExportConfig>;
  unsupportedValues: UnsupportedValuesPolicy;
  unverifiedOptionalExports: UnverifiedOptionalExportsPolicy;
  dependencies: CmxDependency[];
}): CmxBundle {
  const chunks = getOutputChunks(input.outputBundle);
  const bundleChunks = chunks.map(toBundleChunk);

  return {
    version: CMX_BUNDLE_VERSION,
    runtime: {
      importSource: input.runtimeImportSource,
    },
    exports: input.exports,
    unsupportedValues: input.unsupportedValues,
    unverifiedOptionalExports: input.unverifiedOptionalExports,
    dependencies: [...input.dependencies].sort((left, right) =>
      left.name.localeCompare(right.name),
    ),
    entries: chunks
      .filter((chunk) => chunk.isEntry)
      .sort(
        (left, right) =>
          entrySortIndex(left, input.entryOrder) -
          entrySortIndex(right, input.entryOrder),
      )
      .map((chunk) => {
        const bundleChunk = toBundleChunk(chunk);
        return {
          name: chunk.name,
          file: bundleChunk.file,
          sourcemap: bundleChunk.sourcemap,
        };
      }),
    chunks: bundleChunks,
  };
}

function getOutputChunks(bundle: OutputBundle): OutputChunk[] {
  return Object.values(bundle)
    .filter((item): item is OutputChunk => item.type === "chunk")
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function toBundleChunk(chunk: OutputChunk): CmxBundleChunk {
  if (!chunk.sourcemapFileName) {
    throw new Error(`Missing sourcemap for emitted chunk ${chunk.fileName}.`);
  }

  return {
    file: chunk.fileName,
    sourcemap: chunk.sourcemapFileName,
    isEntry: chunk.isEntry,
  };
}

function entrySortIndex(
  chunk: OutputChunk,
  entryOrder: Map<string, number>,
): number {
  if (!chunk.facadeModuleId) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (
    entryOrder.get(normalizeModulePath(chunk.facadeModuleId)) ??
    Number.MAX_SAFE_INTEGER
  );
}
