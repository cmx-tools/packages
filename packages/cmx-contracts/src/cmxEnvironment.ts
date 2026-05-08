import type { CmxDependency } from "./cmxDependency.js";

export type CmxEnvironment = {
  dependencies: CmxDependency[];
  imports: Record<string, Record<string, unknown>>;
};
