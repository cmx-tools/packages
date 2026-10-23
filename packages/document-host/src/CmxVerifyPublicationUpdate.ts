import type {
  CmxDocument,
  CmxDocumentVerificationResult,
} from "@cmx-tools/contracts";

export type CmxPublicationUpdate = {
  upsert: Record<string, CmxDocument>;
  remove: string[];
};

export type CmxPublicationDocumentLoader = (
  entryName: string,
) => Promise<CmxDocument | undefined>;

export type CmxVerifyPublicationUpdate = (
  update: CmxPublicationUpdate,
  loadDocument: CmxPublicationDocumentLoader,
) => CmxDocumentVerificationResult | Promise<CmxDocumentVerificationResult>;
