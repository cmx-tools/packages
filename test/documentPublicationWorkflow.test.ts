import { expect, it } from "vitest";
import { CMX_DOCUMENT_SCHEMA, type CmxDocument } from "@cmx-tools/contracts";
import {
  createCmxDocumentHost,
  createMemoryCmxDocumentStore,
} from "@cmx-tools/document-host";
import { CmxPublicationError, publishCmxDocuments } from "@cmx-tools/publish";
import { createDocumentHostTestServer } from "./createDocumentHostTestServer.js";

it("recalculates a publication when another publisher commits during verification", async () => {
  const entered = deferred();
  const release = deferred();
  let paused = false;
  const host = createCmxDocumentHost({
    store: createMemoryCmxDocumentStore(),
    async verifyPublicationUpdate(update) {
      if (update.upsert.home?.content.default === "Desired home" && !paused) {
        paused = true;
        entered.resolve();
        await release.promise;
      }
      return { valid: true };
    },
  });
  const statuses: number[] = [];
  const server = await createDocumentHostTestServer(async (request) => {
    const response = await host.handlePublication(request);
    if (request.method === "PUT") statuses.push(response.status);
    return response;
  });

  try {
    await publishCmxDocuments({
      endpoint: server.endpoint,
      documents: { old: document("Old page") },
    });
    statuses.length = 0;
    const desired = { home: document("Desired home") };
    const publishing = publishCmxDocuments({
      endpoint: server.endpoint,
      documents: desired,
    });
    try {
      await Promise.race([
        entered.promise,
        publishing.then(() => {
          throw new Error(
            "Publication finished before verification was released",
          );
        }),
      ]);
      expect(await host.getDocument("old")).toEqual(document("Old page"));
      expect(await host.getDocument("home")).toBeUndefined();

      await publishCmxDocuments({
        endpoint: server.endpoint,
        documents: { contact: document("Concurrent contact page") },
      });
    } finally {
      release.resolve();
      await publishing;
    }

    expect(statuses).toEqual([200, 409, 200]);
    expect(await host.getDocument("home")).toEqual(desired.home);
    expect(await host.getDocument("contact")).toBeUndefined();
    expect(await host.getDocument("old")).toBeUndefined();
  } finally {
    release.resolve();
    await server.close();
  }
});

it("reports rejected fallback removal without replacing the accepted publication", async () => {
  const diagnostics = [
    {
      severity: "error" as const,
      code: "app/missing-fallback",
      message: "The required 404 Document is missing.",
    },
  ];
  const host = createCmxDocumentHost({
    store: createMemoryCmxDocumentStore(),
    async verifyPublicationUpdate(_update, loadDocument) {
      return (await loadDocument("404")) === undefined
        ? { valid: false, diagnostics }
        : { valid: true };
    },
  });
  const server = await createDocumentHostTestServer(host.handlePublication);
  const accepted = {
    home: document("Accepted home"),
    "404": document("Accepted fallback"),
  };
  try {
    await publishCmxDocuments({
      endpoint: server.endpoint,
      documents: accepted,
    });
    const before = await (await fetch(server.endpoint)).json();
    const error = await publishCmxDocuments({
      endpoint: server.endpoint,
      documents: { home: document("Rejected replacement") },
    }).catch((error: unknown) => error);

    expect(error).toBeInstanceOf(CmxPublicationError);
    expect(error).toMatchObject({
      status: 422,
      message: "Publication Update rejected.",
      diagnostics,
    });
    expect(await (await fetch(server.endpoint)).json()).toEqual(before);
    expect(await host.getDocument("home")).toEqual(accepted.home);
    expect(await host.getDocument("404")).toEqual(accepted["404"]);
  } finally {
    await server.close();
  }
});

it("recognizes committed content after a proxy loses the publication acknowledgement", async () => {
  const host = createCmxDocumentHost({ store: createMemoryCmxDocumentStore() });
  let puts = 0;
  const server = await createDocumentHostTestServer(async (request) => {
    const response = await host.handlePublication(request);
    if (request.method === "PUT" && response.status === 200 && puts++ === 0) {
      return Response.json(
        { message: "Publication acknowledgement lost" },
        { status: 502 },
      );
    }
    return response;
  });
  const documents = { about: document("Published despite the proxy failure") };
  try {
    await expect(
      publishCmxDocuments({ endpoint: server.endpoint, documents }),
    ).rejects.toMatchObject({
      name: "CmxPublicationError",
      status: 502,
    });
    expect(await host.getDocument("about")).toEqual(documents.about);

    await expect(
      publishCmxDocuments({ endpoint: server.endpoint, documents }),
    ).resolves.toEqual({
      contentHash: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
    });
    expect(puts).toBe(1);
  } finally {
    await server.close();
  }
});

function document(text: string): CmxDocument {
  return {
    $schema: CMX_DOCUMENT_SCHEMA,
    cmxVersion: 1,
    interface: { imports: {}, exports: { default: {} } },
    content: { default: text },
  };
}

function deferred(): { promise: Promise<void>; resolve(): void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
