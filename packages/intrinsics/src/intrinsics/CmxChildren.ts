import type { RuntimeNode } from "@cmx-tools/runtime";

type ResolvedChildren =
  | RuntimeNode
  | string
  | number
  | boolean
  | null
  | readonly CmxChildren[];

export type CmxChildren = ResolvedChildren | Promise<ResolvedChildren>;
