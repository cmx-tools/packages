import type { CmxDocument } from "@cmx-tools/contracts";
import type { CmxPublicationState } from "@cmx-tools/publish";

export type CmxDocumentStoreCommit = {
  baseContentHash: string;
  target: CmxPublicationState;
  upsert: Record<string, CmxDocument>;
  remove: string[];
};

export type CmxDocumentStore = {
  getState(): Promise<CmxPublicationState>;
  getDocument(entryName: string): Promise<CmxDocument | undefined>;
  commit(publication: CmxDocumentStoreCommit): Promise<boolean>;
};
