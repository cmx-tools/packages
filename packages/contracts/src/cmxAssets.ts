export type CmxAssetJson =
  | null
  | boolean
  | number
  | string
  | CmxAssetJson[]
  | { [key: string]: CmxAssetJson };

export type CmxAssetInput<Options = unknown> = {
  bytes: Uint8Array;
  relativePath: string;
  options: Options;
};

export type CmxAssetLoader<Options = CmxAssetJson | undefined> = {
  version: string;
  extensions: readonly string[];
  options?: Options;
  load(input: CmxAssetInput<Options>): unknown;
};

export type CmxAssetsConfig = {
  loaders: Record<string, CmxAssetLoader>;
  cacheDir?: string;
};
