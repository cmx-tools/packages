import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CmxAssetJson, CmxAssetsConfig } from "@cmx-tools/contracts";
import { cmxAssetCacheKey, loadCmxAsset } from "./loadCmxAsset.js";
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
  const loaders = Object.entries(options.assets.loaders);
  const loading = new Map<string, Promise<CmxAssetJson>>();
  function loaderFor(filename: string) {
    return loaders.find(([, loader]) =>
      loader.extensions.some(
        (extension) =>
          extension.toLowerCase() === path.extname(filename).toLowerCase(),
      ),
    );
  }
  async function prepareAsset(filename: string) {
    const selected = loaderFor(filename);
    if (!selected) throw new Error(`No asset loader matches ${filename}`);
    const [identity, loader] = selected;
    const absolute = path.resolve(cwd, filename);
    const relativePath = path.relative(cwd, absolute).split(path.sep).join("/");
    const bytes = await readFile(absolute);
    const key = cmxAssetCacheKey(bytes, relativePath, identity, loader);
    let pending = loading.get(key);
    if (!pending) {
      pending = loadCmxAsset(
        bytes,
        relativePath,
        loader,
        path.join(
          path.resolve(cwd, options.assets.cacheDir ?? ".cmx/assets"),
          key,
        ),
      );
      loading.set(key, pending);
      pending.catch(() => loading.delete(key));
    }
    return pending;
  }
  return {
    prepare(prepareOptions: PrepareCmxAssetImportsOptions) {
      return prepareCmxAssetImports(
        cwd,
        prepareOptions,
        loaderFor,
        prepareAsset,
      );
    },
    matches(filename: string) {
      return loaderFor(filename) !== undefined;
    },
    async load(filename: string): Promise<CmxAssetJson> {
      return structuredClone(await prepareAsset(filename));
    },
  };
}
