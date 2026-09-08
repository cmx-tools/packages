import type { CmxDocument } from "@cmx-tools/contracts";
import { verifyCmxDocument } from "./verifyCmxDocument.js";

export function isCmxDocument(value: unknown): value is CmxDocument {
  return verifyCmxDocument(value).valid;
}
