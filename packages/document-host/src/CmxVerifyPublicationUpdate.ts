import type {
  CmxDocument,
  CmxDocumentVerificationResult,
} from "@cmx-tools/contracts";
import type { CmxProposedPublication } from "./CmxProposedPublication.js";

export type CmxPublicationUpdate = {
  upsert: Record<string, CmxDocument>;
  remove: string[];
};

export type CmxVerifyPublicationUpdate = (
  update: CmxPublicationUpdate,
  publication: CmxProposedPublication,
) => CmxDocumentVerificationResult | Promise<CmxDocumentVerificationResult>;
