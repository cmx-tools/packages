import type { OutputBundle, PluginContext } from "rolldown";

export function emitEntryFacadeSourcemaps(
  context: PluginContext,
  outputBundle: OutputBundle,
): void {
  for (const chunk of Object.values(outputBundle)) {
    if (
      chunk.type !== "chunk" ||
      !chunk.isEntry ||
      !chunk.facadeModuleId ||
      chunk.moduleIds.length > 0 ||
      chunk.map
    ) {
      continue;
    }

    chunk.sourcemapFileName ??= `${chunk.fileName}.map`;
    context.emitFile({
      type: "asset",
      fileName: chunk.sourcemapFileName,
      source: JSON.stringify({
        version: 3,
        file: chunk.fileName,
        sources: [],
        names: [],
        mappings: "",
      }),
    });
  }
}
