import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CmxAssetJson, CmxAssetsConfig } from "@cmx-tools/contracts";
import { cmxAssetCacheKey, processCmxAsset } from "./processCmxAsset.js";
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
  const processing = new Map<string, Promise<CmxAssetJson>>();
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
    const absolute = path.resolve(cwd, filename);
    const relativePath = path.relative(cwd, absolute).split(path.sep).join("/");
    const bytes = await readFile(absolute);
    const key = cmxAssetCacheKey(bytes, relativePath, identity, processor);
    let pending = processing.get(key);
    if (!pending) {
      pending = processCmxAsset(
        bytes,
        relativePath,
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
    async load(filename: string): Promise<CmxAssetJson> {
      return structuredClone(await prepareAsset(filename));
    },
  };
}
