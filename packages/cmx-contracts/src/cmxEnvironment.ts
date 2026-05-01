import type { CmxDependency } from "./cmxDependency.js";
import type { CmxTypeRef } from "./cmxBundle.js";

export type CmxEnvironment<Meta = unknown> = {
  dependencies: CmxDependency[];
  imports: Record<string, Record<string, unknown>>;
  metaType?: CmxTypeRef;
  __meta?: Meta;
};
