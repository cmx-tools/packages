export type CmxAssetJson =
  | null
  | boolean
  | number
  | string
  | CmxAssetJson[]
  | { [key: string]: CmxAssetJson };

export type CmxAssetInput<Options = unknown> = {
  bytes: Uint8Array;
  name: string;
  options: Options;
};

export type CmxAssetProcessor<Options = CmxAssetJson | undefined> = {
  version: string;
  extensions: readonly string[];
  options?: Options;
  process(input: CmxAssetInput<Options>): unknown;
};

export type CmxAssetsConfig = {
  processors: Record<string, CmxAssetProcessor>;
  cacheDir?: string;
};
