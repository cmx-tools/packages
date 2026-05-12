import type { CmxDependency } from "./cmxDependency.js";

declare const CMX_ENVIRONMENT_EXPORTS: unique symbol;

export type CmxEnvironment<
  Exports extends Record<string, unknown> = Record<string, unknown>,
> = {
  dependencies: CmxDependency[];
  imports: Record<string, Record<string, unknown>>;
  [CMX_ENVIRONMENT_EXPORTS]?: Exports;
};
