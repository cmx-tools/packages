import type { CmxDocument } from "@cmx-tools/contracts";
import type { CmxPublicationState } from "@cmx-tools/publish";
import type { CmxDocumentStore } from "./CmxDocumentStore.js";

const emptyContentHash =
  "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";

export function createMemoryCmxDocumentStore(): CmxDocumentStore {
  let state: CmxPublicationState = {
    contentHash: emptyContentHash,
    manifest: {},
  };
  let documents = new Map<string, CmxDocument>();

  return {
    async getState() {
      return structuredClone(state);
    },
    async getDocument(entryName) {
      return structuredClone(documents.get(entryName));
    },
    async commit(publication) {
      if (state.contentHash !== publication.baseContentHash) return false;
      const nextDocuments = new Map(documents);
      for (const name of publication.remove) nextDocuments.delete(name);
      for (const [name, document] of Object.entries(publication.upsert)) {
        nextDocuments.set(name, structuredClone(document));
      }
      const nextState = structuredClone(publication.target);
      documents = nextDocuments;
      state = nextState;
      return true;
    },
  };
}
