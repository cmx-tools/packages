import type { CmxDocument } from "@cmx-tools/contracts";
import {
  hashCmxDocument,
  type CmxPublicationManifest,
} from "@cmx-tools/publish";
import type { CmxDocumentStore } from "./CmxDocumentStore.js";
import type {
  CmxPublicationDocumentLoader,
  CmxPublicationUpdate,
  CmxVerifyPublicationUpdate,
} from "./CmxVerifyPublicationUpdate.js";

export async function verifyCmxPublicationUpdate({
  update,
  manifest,
  store,
  verifyPublicationUpdate,
}: {
  update: CmxPublicationUpdate;
  manifest: CmxPublicationManifest;
  store: CmxDocumentStore;
  verifyPublicationUpdate: CmxVerifyPublicationUpdate;
}) {
  let conflicted = false;
  const reads = new Map<string, Promise<CmxDocument | undefined>>();
  const loadDocument: CmxPublicationDocumentLoader = (entryName) => {
    if (!Object.hasOwn(manifest, entryName)) return Promise.resolve(undefined);
    if (Object.hasOwn(update.upsert, entryName))
      return Promise.resolve(structuredClone(update.upsert[entryName]));
    let read = reads.get(entryName);
    if (!read) {
      read = readUnchangedDocument(entryName);
      reads.set(entryName, read);
    }
    const isolated = read.then((document) => structuredClone(document));
    void isolated.catch(() => undefined);
    return isolated;
  };
  try {
    const result = await verifyPublicationUpdate(
      structuredClone(update),
      loadDocument,
    );
    await Promise.all(reads.values());
    return result;
  } catch (cause) {
    if (conflicted) return { conflict: true as const };
    throw cause;
  }

  async function readUnchangedDocument(entryName: string) {
    const document = await store.getDocument(entryName);
    if (
      !document ||
      (await hashCmxDocument(document)) !== manifest[entryName]
    ) {
      conflicted = true;
      throw new Error("Publication base has changed.");
    }
    return document;
  }
}
