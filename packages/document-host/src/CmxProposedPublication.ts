import type { CmxDocument } from "@cmx-tools/contracts";

export type CmxPublicationDocumentLoader = (
  entryName: string,
) => Promise<CmxDocument | undefined>;

export type CmxProposedPublication = {
  getEntryNames(): readonly string[];
  loadDocument: CmxPublicationDocumentLoader;
};
