import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CmxAssetsConfig } from "@cmx-tools/contracts";
import {
  cmxAssetCacheKey,
  processCmxAsset,
  type ProcessedCmxAsset,
} from "./processCmxAsset.js";
import { mapCmxAssetData } from "./mapCmxAssetData.js";
import {
  prepareCmxAssetImports,
  type PrepareCmxAssetImportsOptions,
} from "./prepareCmxAssetImports.js";

export type CreateCmxAssetPipelineOptions = {
  cwd?: string;
  assets: CmxAssetsConfig;
};

export function createCmxAssetPipeline(options: CreateCmxAssetPipelineOptions) {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const processors = Object.entries(options.assets.processors);
  const processing = new Map<string, Promise<ProcessedCmxAsset>>();
  const uploads = new Map<string, Promise<string>>();
  function processorFor(filename: string) {
    return processors.find(([, processor]) =>
      processor.extensions.some(
        (extension) =>
          extension.toLowerCase() === path.extname(filename).toLowerCase(),
      ),
    );
  }
  async function prepareAsset(filename: string) {
    const selected = processorFor(filename);
    if (!selected) throw new Error(`No asset processor matches ${filename}`);
    const [identity, processor] = selected;
    const bytes = await readFile(path.resolve(cwd, filename));
    const key = cmxAssetCacheKey(bytes, identity, processor);
    let pending = processing.get(key);
    if (!pending) {
      pending = processCmxAsset(
        bytes,
        processor,
        path.join(
          path.resolve(cwd, options.assets.cacheDir ?? ".cmx/assets"),
          key,
        ),
      );
      processing.set(key, pending);
      pending.catch(() => processing.delete(key));
    }
    return pending;
  }
  return {
    prepare(prepareOptions: PrepareCmxAssetImportsOptions) {
      return prepareCmxAssetImports(
        cwd,
        prepareOptions,
        processorFor,
        prepareAsset,
      );
    },
    matches(filename: string) {
      return processorFor(filename) !== undefined;
    },
    async load(filename: string): Promise<unknown> {
      const result = await prepareAsset(filename);
      return mapCmxAssetData(result.data, (reference) => {
        let upload = uploads.get(reference.$cmxAsset);
        if (!upload) {
          const file = result.files.get(reference.$cmxAsset);
          if (!file)
            throw new Error("Processor returned an unknown asset file");
          upload = options.assets.storage.store(file);
          uploads.set(file.key, upload);
          upload.catch(() => uploads.delete(file.key));
        }
        return upload;
      });
    },
  };
}
