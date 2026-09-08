import type { CmxDependency } from "./cmxDependency.js";
import type { CmxTypeRef, CmxVersion } from "./cmxBundle.js";

export const CMX_DOCUMENT_SCHEMA =
  "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json";
export const CMX_DOCUMENT_VERSION: CmxVersion = 1;

export type SlotPath = Array<string | number>;

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

export type CmxDocumentExport = {
  type?: CmxTypeRef;
  slots?: SlotPath[];
};

export type CmxDocumentInterface = {
  imports: Record<string, CmxDependency>;
  exports: Record<string, CmxDocumentExport>;
};

export type CmxDocument = {
  $schema: typeof CMX_DOCUMENT_SCHEMA;
  cmxVersion: CmxVersion;
  interface: CmxDocumentInterface;
  content: Record<string, unknown>;
};

export function isCmxDocument(value: unknown): value is CmxDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.$schema === CMX_DOCUMENT_SCHEMA &&
    typeof candidate.cmxVersion === "number" &&
    typeof candidate.interface === "object" &&
    candidate.interface !== null &&
    !Array.isArray(candidate.interface) &&
    typeof candidate.content === "object" &&
    candidate.content !== null &&
    !Array.isArray(candidate.content)
  );
}
