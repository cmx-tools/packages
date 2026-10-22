export type CmxAssetJson =
  | null
  | boolean
  | number
  | string
  | CmxAssetJson[]
  | { [key: string]: CmxAssetJson };

export type CmxAssetFile = { readonly $cmxAsset: string };

export type CmxAssetInput<Options = unknown> = {
  bytes: Uint8Array;
  options: Options;
  file(extension: string): CmxAssetFile;
  emit(bytes: Uint8Array, extension: string): CmxAssetFile;
};

export type CmxAssetProcessor<Options = CmxAssetJson | undefined> = {
  version: string;
  extensions: readonly string[];
  options?: Options;
  process(input: CmxAssetInput<Options>): unknown;
};

export type CmxStoredAssetFile = {
  key: string;
  bytes: Uint8Array;
};

export type CmxAssetStorage = {
  store(file: CmxStoredAssetFile): Promise<string>;
};

export type CmxAssetsConfig = {
  processors: Record<string, CmxAssetProcessor>;
  cacheDir?: string;
  storage: CmxAssetStorage;
};

export type CmxResolvedAsset<Value> = Value extends CmxAssetFile
  ? string
  : Value extends readonly unknown[]
    ? { [Index in keyof Value]: CmxResolvedAsset<Value[Index]> }
    : Value extends object
      ? { [Key in keyof Value]: CmxResolvedAsset<Value[Key]> }
      : Value;
