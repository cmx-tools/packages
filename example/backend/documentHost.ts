import { verifyCmxDocumentEnvironment } from "@cmx-tools/contracts";
import {
  createCmxDocumentHost,
  createMemoryCmxDocumentStore,
} from "@cmx-tools/document-host";
import { contentElements, createCmxUgcVerifier } from "@cmx-tools/verify";
import { reactUgcPolicy } from "@cmx-tools/react";
import { environment } from "./_gen_cmx_environment.js";

const verifyUgc = createCmxUgcVerifier({
  policy: reactUgcPolicy,
  allowedElements: [...contentElements, "img"],
});

export const documentHost = createCmxDocumentHost({
  store: createMemoryCmxDocumentStore(),
  async verifyPublicationUpdate(update) {
    for (const document of Object.values(update.upsert)) {
      const compatible = verifyCmxDocumentEnvironment(document, environment);
      if (!compatible.valid) return compatible;
      const safe = await verifyUgc(document);
      if (!safe.valid) return safe;
    }
    return { valid: true };
  },
});
