import type { CmxDependency } from "./cmxDependency.js";
import type { CmxTypeRef, CmxVersion } from "./cmxBundle.js";

export type SlotPath = Array<string | number>;

export const CMX_DOCUMENT_VERSION: CmxVersion = 1;

export type CmxFragmentNode = {
  type: "fragment";
  children?: CmxNode[];
};

export type CmxElementNode = {
  type: "element";
  tag: string;
  props?: Record<string, unknown>;
  slots?: SlotPath[];
  children?: CmxNode[];
};

export type CmxComponentNode = {
  type: "component";
  from: string;
  import?: string;
  props?: Record<string, unknown>;
  slots?: SlotPath[];
  children?: CmxNode[];
};

export type CmxNode =
  | null
  | boolean
  | number
  | string
  | CmxFragmentNode
  | CmxElementNode
  | CmxComponentNode;

export type CmxMeta = {
  type?: CmxTypeRef;
  data: unknown;
};

export type CmxDocument = {
  $schema: string;
  cmxVersion: CmxVersion;
  dependencies: CmxDependency[];
  meta?: CmxMeta;
  tree: CmxNode;
};
