import type { CmxDiagnostic, CmxDocument } from "@cmx-tools/contracts";
import {
  hashCmxDocument,
  hashCmxPublicationManifest,
} from "@cmx-tools/publish";
import { verifyCmxDocument } from "@cmx-tools/verify";
import type { CmxDocumentStore } from "./CmxDocumentStore.js";
import type { CmxVerifyPublicationUpdate } from "./CmxVerifyPublicationUpdate.js";
import { verifyCmxPublicationUpdate } from "./verifyCmxPublicationUpdate.js";
import { readCmxPublicationDelta } from "./readCmxPublicationDelta.js";

export type CmxDocumentHost = {
  handlePublication(request: Request): Promise<Response>;
  getDocument(entryName: string): Promise<CmxDocument | undefined>;
};

export function createCmxDocumentHost({
  store,
  verifyPublicationUpdate,
}: {
  store: CmxDocumentStore;
  verifyPublicationUpdate?: CmxVerifyPublicationUpdate;
}): CmxDocumentHost {
  return {
    async handlePublication(request) {
      if (request.method !== "GET" && request.method !== "PUT")
        return Response.json(
          { message: "Method not allowed." },
          { status: 405, headers: { Allow: "GET, PUT" } },
        );
      try {
        const state = await store.getState();
        if (request.method === "PUT") {
          const update = await readCmxPublicationDelta(request);
          if (!update)
            return Response.json(
              { message: "Invalid publication request." },
              { status: 400 },
            );
          if (state.contentHash !== update.baseContentHash)
            return Response.json(
              { message: "Publication base has changed." },
              { status: 409 },
            );
          const failures: Array<[string, CmxDiagnostic[]]> = [];
          for (const [name, document] of Object.entries(update.upsert)) {
            const result = verifyCmxDocument(document);
            if (!result.valid) failures.push([name, result.diagnostics]);
          }
          if (failures.length)
            return Response.json(
              {
                message: "Documents rejected.",
                diagnostics: Object.fromEntries(failures),
              },
              { status: 422 },
            );
          const manifest = { ...state.manifest };
          for (const name of update.remove) delete manifest[name];
          for (const [name, document] of Object.entries(update.upsert)) {
            Object.defineProperty(manifest, name, {
              value: await hashCmxDocument(document),
              enumerable: true,
              configurable: true,
              writable: true,
            });
          }
          const target = {
            contentHash: await hashCmxPublicationManifest(manifest),
            manifest,
          };
          if (target.contentHash !== update.targetContentHash)
            return Response.json(
              {
                message: "Publication does not match its target content hash.",
              },
              { status: 400 },
            );
          if (verifyPublicationUpdate) {
            const result = await verifyCmxPublicationUpdate({
              update: { upsert: update.upsert, remove: update.remove },
              manifest,
              store,
              verifyPublicationUpdate,
            });
            if ("conflict" in result)
              return Response.json(
                { message: "Publication base has changed." },
                { status: 409 },
              );
            if (!result.valid)
              return Response.json(
                {
                  message: "Publication Update rejected.",
                  diagnostics: result.diagnostics,
                },
                { status: 422 },
              );
          }
          const committed = await store.commit({ ...update, target });
          return committed
            ? Response.json({ contentHash: target.contentHash })
            : Response.json(
                { message: "Publication base has changed." },
                { status: 409 },
              );
        }
        const headers = {
          ETag: `"${state.contentHash}"`,
          "Cache-Control": "no-cache",
        };
        return matchesEtag(
          request.headers.get("If-None-Match"),
          state.contentHash,
        )
          ? new Response(null, { status: 304, headers })
          : Response.json(state, { headers });
      } catch {
        return Response.json(
          { message: "Document publication failed." },
          { status: 500 },
        );
      }
    },
    async getDocument(entryName) {
      return store.getDocument(entryName);
    },
  };
}

function matchesEtag(header: string | null, contentHash: string): boolean {
  if (header?.trim() === "*") return true;
  return Array.from(
    (header ?? "").matchAll(/(?:^|,)\s*(?:W\/)?"([^"]*)"\s*(?=,|$)/g),
  ).some((match) => match[1] === contentHash);
}
