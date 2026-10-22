import type { CmxAssetInput, CmxAssetJson } from "@cmx-tools/contracts";

export function defineCmxAssetProcessor<
  Options extends CmxAssetJson | undefined = undefined,
  Result = unknown,
>(processor: {
  version: string;
  extensions: readonly string[];
  options?: Options;
  process(input: CmxAssetInput<Options>): Result;
}) {
  return processor;
}
