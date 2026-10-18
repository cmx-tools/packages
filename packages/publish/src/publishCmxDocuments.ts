import type { CmxDocument } from "@cmx-tools/contracts";
import { CmxPublicationError } from "./CmxPublicationError.js";
import {
  createCmxPublicationState,
  snapshotCmxDocuments,
  type CmxPublicationResult,
} from "./publicationProtocol/index.js";
import {
  readCmxPublicationError,
  readCmxPublicationResult,
  readCmxPublicationState,
} from "./readCmxPublicationState.js";

export async function publishCmxDocuments({
  endpoint,
  documents,
  signal,
}: {
  endpoint: string;
  documents: Record<string, CmxDocument>;
  signal?: AbortSignal;
}): Promise<CmxPublicationResult> {
  try {
    documents = snapshotCmxDocuments(documents);
    const target = await createCmxPublicationState(documents);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await fetch(endpoint, {
        cache: "no-store",
        signal,
        headers: {
          "Cache-Control": "no-cache",
          "If-None-Match": `"${target.contentHash}"`,
        },
      });
      if (response.status === 304) return { contentHash: target.contentHash };
      const current = await readCmxPublicationState(response);
      const delta = {
        baseContentHash: current.contentHash,
        targetContentHash: target.contentHash,
        upsert: Object.fromEntries(
          Object.entries(documents).filter(
            ([name]) =>
              !Object.hasOwn(current.manifest, name) ||
              current.manifest[name] !== target.manifest[name],
          ),
        ),
        remove: Object.keys(current.manifest).filter(
          (name) => !Object.hasOwn(target.manifest, name),
        ),
      };
      const result = await fetch(endpoint, {
        method: "PUT",
        signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(delta),
      });
      if (result.status === 409 && attempt === 0) {
        await result.body?.cancel();
        continue;
      }
      if (result.status === 409) throw await readCmxPublicationError(result);
      await readCmxPublicationResult(result, target.contentHash);
      return { contentHash: target.contentHash };
    }
    throw new CmxPublicationError("Publication conflicted twice.", {
      status: 409,
    });
  } catch (cause) {
    if (cause instanceof CmxPublicationError) throw cause;
    throw new CmxPublicationError(
      cause instanceof Error ? cause.message : "Document publication failed.",
      { cause },
    );
  }
}
