import { verifyCmxDocumentEnvironment } from "@cmx-tools/contracts";
import {
  createCmxDocumentHost,
  createMemoryCmxDocumentStore,
} from "@cmx-tools/document-host";
import { createCmxUgcVerifier } from "@cmx-tools/verify";
import { reactUgcPolicy } from "@cmx-tools/react";
import { environment } from "./_gen_cmx_environment.js";

const verifyUgc = createCmxUgcVerifier({ policy: reactUgcPolicy });

export const documentHost = createCmxDocumentHost({
  store: createMemoryCmxDocumentStore(),
  async verifyIncomingDocument(document) {
    const compatible = verifyCmxDocumentEnvironment(document, environment);
    if (!compatible.valid) return compatible;
    return verifyUgc(document);
  },
});
