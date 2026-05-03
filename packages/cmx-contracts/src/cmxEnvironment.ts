import type { CmxDependency } from "./cmxDependency.js";
import type { CmxMetaType } from "./cmxBundle.js";

export type CmxEnvironment<Meta = unknown> = {
  dependencies: CmxDependency[];
  imports: Record<string, Record<string, unknown>>;
  metaType?: CmxMetaType;
  __meta?: { type: Meta };
};

export type InferCmxMeta<Environment extends CmxEnvironment> =
  Environment extends CmxEnvironment<infer Meta> ? Meta : never;
