import type { CmxDocument } from "@cmx-tools/contracts";
import { canonicalJson } from "./canonicalJson.js";

export function snapshotCmxDocuments(
  documents: Record<string, CmxDocument>,
): Record<string, CmxDocument> {
  const snapshot: unknown = JSON.parse(canonicalJson(documents));
  if (!isRecord(snapshot) || !Object.values(snapshot).every(isRecord)) {
    throw new TypeError(
      "Publication input must be a JSON entry map of Documents.",
    );
  }
  return snapshot as Record<string, CmxDocument>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
