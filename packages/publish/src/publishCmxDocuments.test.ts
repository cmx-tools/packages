import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { describe, expect, it } from "vitest";
import {
  CMX_DOCUMENT_SCHEMA,
  CmxError,
  type CmxDocument,
} from "@cmx-tools/contracts";
import {
  CmxPublicationError,
  createCmxPublicationState,
  hashCmxDocument,
  hashCmxPublicationManifest,
  publishCmxDocuments,
} from "@cmx-tools/publish";

const unicodeDocument: CmxDocument = {
  $schema: CMX_DOCUMENT_SCHEMA,
  cmxVersion: 1,
  interface: { imports: {}, exports: { default: {} } },
  content: {
    default: { title: "Grüße 🌍", tags: ["z", "a"], count: 2 },
  },
};
const unicodeContentHash =
  "sha256:552e6c4622892ab14c2b0143e908c3aa535ef35d690c0e05aa1811c982c69bae";

async function withEndpoint(
  handle: (
    request: IncomingMessage,
    response: ServerResponse,
  ) => void | Promise<void>,
  run: (endpoint: string) => Promise<void>,
): Promise<void> {
  const failures: unknown[] = [];
  const server = createServer((request, response) => {
    Promise.resolve()
      .then(() => handle(request, response))
      .catch((error) => {
        failures.push(error);
        response.writeHead(500).end();
      });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const { port } = server.address() as AddressInfo;
    await run(`http://127.0.0.1:${port}/cmx`);
    expect(failures).toEqual([]);
  } finally {
    server.closeAllConnections();
    server.close();
    await once(server, "close");
  }
}

describe("publishing CMX Documents", () => {
  it("publishes through an application-authenticated transport without losing protocol headers or content", async () => {
    const current = await createCmxPublicationState({});
    await withEndpoint(
      async (request, response) => {
        if (request.headers.authorization !== "Bearer application-token") {
          response.writeHead(401).end();
          return;
        }
        response.setHeader("Content-Type", "application/json");
        if (request.method === "GET") {
          expect(request.headers["cache-control"]).toBe("no-cache");
          expect(request.headers["if-none-match"]).toBe(
            `"${unicodeContentHash}"`,
          );
          response.setHeader("ETag", `"${current.contentHash}"`);
          response.end(JSON.stringify(current));
          return;
        }
        expect(request.method).toBe("PUT");
        expect(request.headers["content-type"]).toBe("application/json");
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({
          baseContentHash: current.contentHash,
          targetContentHash: unicodeContentHash,
          upsert: { "blog/über": unicodeDocument },
          remove: [],
        });
        response.end(JSON.stringify({ contentHash: unicodeContentHash }));
      },
      async (endpoint) => {
        await expect(
          publishCmxDocuments({
            endpoint,
            documents: { "blog/über": unicodeDocument },
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              headers.set("Authorization", "Bearer application-token");
              return fetch(input, { ...init, headers });
            },
          }),
        ).resolves.toEqual({ contentHash: unicodeContentHash });
      },
    );
  });

  it("recognizes an already published Unicode collection by its canonical content hash", async () => {
    let requests = 0;
    await withEndpoint(
      (request, response) => {
        requests += 1;
        expect(request.method).toBe("GET");
        expect(request.headers["if-none-match"]).toBe(
          `"${unicodeContentHash}"`,
        );
        response.writeHead(304).end();
      },
      async (endpoint) => {
        await expect(
          publishCmxDocuments({
            endpoint,
            documents: { "blog/über": unicodeDocument },
          }),
        ).resolves.toEqual({ contentHash: unicodeContentHash });
      },
    );
    expect(requests).toBe(1);
  });

  it.each([
    { validator: "strong", prefix: "" },
    { validator: "weak", prefix: "W/" },
  ])(
    "publishes only changed entries through a $validator ETag",
    async ({ prefix }) => {
      const replacement = { ...unicodeDocument, content: { default: "new" } };
      const documents = Object.fromEntries([
        ["blog/über", unicodeDocument],
        ["home", replacement],
        ["__proto__", unicodeDocument],
      ]);
      const previous = await createCmxPublicationState({
        "blog/über": unicodeDocument,
        home: { ...unicodeDocument, content: { default: "old" } },
        obsolete: unicodeDocument,
      });
      const target = await createCmxPublicationState(documents);
      let requests = 0;
      await withEndpoint(
        async (request, response) => {
          requests += 1;
          response.setHeader("Content-Type", "application/json");
          if (request.method === "GET") {
            response.setHeader("ETag", `${prefix}"${previous.contentHash}"`);
            response.end(JSON.stringify(previous));
            return;
          }
          expect(request.method).toBe("PUT");
          expect(request.headers["content-type"]).toBe("application/json");
          const chunks = [];
          for await (const chunk of request) chunks.push(chunk);
          expect(JSON.parse(Buffer.concat(chunks).toString())).toEqual({
            baseContentHash: previous.contentHash,
            targetContentHash: target.contentHash,
            upsert: Object.fromEntries([
              ["home", replacement],
              ["__proto__", unicodeDocument],
            ]),
            remove: ["obsolete"],
          });
          response.end(JSON.stringify({ contentHash: target.contentHash }));
        },
        async (endpoint) => {
          await expect(
            publishCmxDocuments({ endpoint, documents }),
          ).resolves.toEqual({ contentHash: target.contentHash });
        },
      );
      expect(requests).toBe(2);
    },
  );

  it("keeps using the authenticated transport when recalculating after a conflicting publication", async () => {
    const empty = await createCmxPublicationState({});
    const concurrent = await createCmxPublicationState({
      contact: unicodeDocument,
    });
    const target = await createCmxPublicationState({ home: unicodeDocument });
    let gets = 0;
    let puts = 0;
    await withEndpoint(
      async (request, response) => {
        if (request.headers.authorization !== "Bearer application-token") {
          response.writeHead(401).end();
          return;
        }
        response.setHeader("Content-Type", "application/json");
        if (request.method === "GET") {
          const state = gets++ === 0 ? empty : concurrent;
          response.setHeader("ETag", `"${state.contentHash}"`);
          response.end(JSON.stringify(state));
          return;
        }
        const chunks = [];
        for await (const chunk of request) chunks.push(chunk);
        const delta = JSON.parse(Buffer.concat(chunks).toString());
        if (puts++ === 0) {
          expect(delta.baseContentHash).toBe(empty.contentHash);
          expect(delta.remove).toEqual([]);
          response
            .writeHead(409)
            .end(JSON.stringify({ message: "Base changed" }));
          return;
        }
        expect(delta.baseContentHash).toBe(concurrent.contentHash);
        expect(delta.remove).toEqual(["contact"]);
        response.end(JSON.stringify({ contentHash: target.contentHash }));
      },
      async (endpoint) => {
        await expect(
          publishCmxDocuments({
            endpoint,
            documents: { home: unicodeDocument },
            fetch: (input, init) => {
              const headers = new Headers(init?.headers);
              headers.set("Authorization", "Bearer application-token");
              return fetch(input, { ...init, headers });
            },
          }),
        ).resolves.toEqual({ contentHash: target.contentHash });
      },
    );
    expect([gets, puts]).toEqual([2, 2]);
  });

  it("returns grouped host verification diagnostics as a branded publication error", async () => {
    const current = await createCmxPublicationState({});
    const diagnostics = {
      home: [
        {
          severity: "error",
          code: "blocked-tag",
          message: "Script elements are not allowed",
        },
      ],
      about: [
        {
          severity: "error",
          code: "missing-component",
          message: "Component is not available",
        },
      ],
    };
    await withEndpoint(
      (request, response) => {
        response.setHeader("Content-Type", "application/json");
        if (request.method === "GET") {
          response.setHeader("ETag", `"${current.contentHash}"`);
          response.end(JSON.stringify(current));
        } else {
          response
            .writeHead(422)
            .end(
              JSON.stringify({ message: "Documents rejected", diagnostics }),
            );
        }
      },
      async (endpoint) => {
        const error = await publishCmxDocuments({
          endpoint,
          documents: { home: unicodeDocument, about: unicodeDocument },
        }).catch((error: unknown) => error);
        expect(error).toBeInstanceOf(CmxPublicationError);
        expect(error).toBeInstanceOf(CmxError);
        expect(error).toMatchObject({
          status: 422,
          message: "Documents rejected",
          diagnostics,
        });
      },
    );
  });

  it("preserves publication-wide application rejection diagnostics", async () => {
    const current = await createCmxPublicationState({});
    const diagnostics = [
      {
        severity: "error",
        code: "app/missing-fallback",
        message: "The required 404 Document is missing.",
      },
    ];
    await withEndpoint(
      (request, response) => {
        response.setHeader("Content-Type", "application/json");
        if (request.method === "GET") {
          response.setHeader("ETag", `"${current.contentHash}"`);
          response.end(JSON.stringify(current));
        } else {
          response.writeHead(422).end(
            JSON.stringify({
              message: "Publication Update rejected.",
              diagnostics,
            }),
          );
        }
      },
      async (endpoint) => {
        await expect(
          publishCmxDocuments({
            endpoint,
            documents: { home: unicodeDocument },
          }),
        ).rejects.toMatchObject({
          name: "CmxPublicationError",
          status: 422,
          message: "Publication Update rejected.",
          diagnostics,
        });
      },
    );
  });

  it.each([
    { phase: "GET", status: 401 },
    { phase: "PUT", status: 403 },
  ])(
    "preserves HTTP $status when application authentication fails during $phase",
    async ({ phase, status }) => {
      const current = await createCmxPublicationState({});
      const requests: string[] = [];
      await withEndpoint(
        (request, response) => {
          expect(request.headers.authorization).toBe("Bearer expired-token");
          requests.push(request.method!);
          response.setHeader("Content-Type", "application/json");
          if (request.method === phase) {
            response.writeHead(status).end(
              JSON.stringify({
                message: "Application authentication rejected",
              }),
            );
            return;
          }
          response.setHeader("ETag", `"${current.contentHash}"`);
          response.end(JSON.stringify(current));
        },
        async (endpoint) => {
          await expect(
            publishCmxDocuments({
              endpoint,
              documents: { home: unicodeDocument },
              fetch: (input, init) => {
                const headers = new Headers(init?.headers);
                headers.set("Authorization", "Bearer expired-token");
                return fetch(input, { ...init, headers });
              },
            }),
          ).rejects.toMatchObject({
            name: "CmxPublicationError",
            status,
            message: "Application authentication rejected",
          });
        },
      );
      expect(requests).toEqual(phase === "GET" ? ["GET"] : ["GET", "PUT"]);
    },
  );

  it("stops after a second conflict instead of reporting success or retrying indefinitely", async () => {
    const current = await createCmxPublicationState({});
    let gets = 0;
    let puts = 0;
    await withEndpoint(
      (request, response) => {
        response.setHeader("Content-Type", "application/json");
        if (request.method === "GET") {
          gets += 1;
          response.setHeader("ETag", `"${current.contentHash}"`);
          response.end(JSON.stringify(current));
        } else {
          puts += 1;
          response
            .writeHead(409)
            .end(JSON.stringify({ message: "Concurrent publication" }));
        }
      },
      async (endpoint) => {
        await expect(
          publishCmxDocuments({
            endpoint,
            documents: { home: unicodeDocument },
          }),
        ).rejects.toMatchObject({ name: "CmxPublicationError", status: 409 });
      },
    );
    expect([gets, puts]).toEqual([2, 2]);
  });

  it.each([
    { label: "malformed manifest JSON", stateBody: "{", expectedPuts: 0 },
    {
      label: "an unverified manifest hash",
      expectedPuts: 0,
      stateBody: JSON.stringify({
        contentHash: unicodeContentHash,
        manifest: {},
      }),
    },
    {
      label: "an invalid manifest value",
      expectedPuts: 0,
      stateBody: JSON.stringify({
        contentHash: unicodeContentHash,
        manifest: { home: 1 },
      }),
    },
    {
      label: "an ETag that differs from the manifest",
      expectedPuts: 0,
      etag: `"${unicodeContentHash}"`,
    },
    { label: "a missing manifest ETag", etag: null, expectedPuts: 0 },
    {
      label: "a successful status with no activated hash",
      expectedPuts: 1,
      acknowledgement: "{}",
    },
    {
      label: "a different activated hash",
      expectedPuts: 1,
      acknowledgement: JSON.stringify({ contentHash: unicodeContentHash }),
    },
    {
      label: "an HTML error page",
      expectedPuts: 1,
      errorStatus: 503,
      acknowledgement: "<html>Unavailable</html>",
    },
  ])(
    "rejects $label through the publication error boundary",
    async ({ stateBody, etag, acknowledgement, errorStatus, expectedPuts }) => {
      const current = await createCmxPublicationState({});
      let puts = 0;
      await withEndpoint(
        (request, response) => {
          response.setHeader("Content-Type", "application/json");
          if (request.method === "GET") {
            if (etag !== null)
              response.setHeader("ETag", etag ?? `"${current.contentHash}"`);
            response.end(stateBody ?? JSON.stringify(current));
          } else {
            puts += 1;
            response.writeHead(errorStatus ?? 200).end(acknowledgement);
          }
        },
        async (endpoint) => {
          await expect(
            publishCmxDocuments({
              endpoint,
              documents: { home: unicodeDocument },
            }),
          ).rejects.toBeInstanceOf(CmxPublicationError);
        },
      );
      expect(puts).toBe(expectedPuts);
    },
  );

  it("publishes the snapshot taken at invocation even when caller data changes during the exchange", async () => {
    const document = structuredClone(unicodeDocument);
    const documents = { "blog/über": document };
    const current = await createCmxPublicationState({});
    await withEndpoint(
      async (request, response) => {
        response.setHeader("Content-Type", "application/json");
        if (request.method === "GET") {
          document.content.default = "mutated while publishing";
          response.setHeader("ETag", `"${current.contentHash}"`);
          response.end(JSON.stringify(current));
        } else {
          const chunks = [];
          for await (const chunk of request) chunks.push(chunk);
          const delta = JSON.parse(Buffer.concat(chunks).toString());
          expect(delta.targetContentHash).toBe(unicodeContentHash);
          expect(delta.upsert["blog/über"]).toEqual(unicodeDocument);
          response.end(JSON.stringify({ contentHash: unicodeContentHash }));
        }
      },
      async (endpoint) => {
        await expect(
          publishCmxDocuments({ endpoint, documents }),
        ).resolves.toEqual({ contentHash: unicodeContentHash });
      },
    );
  });

  it.each([
    { label: "undefined", value: undefined },
    { label: "nonfinite numbers", value: Number.NaN },
    { label: "sparse arrays", value: new Array(2) },
    { label: "Date objects", value: new Date("2026-01-01") },
    {
      label: "custom JSON transformations",
      value: { toJSON: () => "different" },
    },
    {
      label: "cyclic values",
      value: (() => {
        const value: Record<string, unknown> = {};
        value.self = value;
        return value;
      })(),
    },
  ])(
    "rejects $label before making a publication request",
    async ({ value }) => {
      let requests = 0;
      await withEndpoint(
        (_request, response) => {
          requests += 1;
          response.writeHead(500).end();
        },
        async (endpoint) => {
          await expect(
            publishCmxDocuments({
              endpoint,
              documents: {
                home: { ...unicodeDocument, content: { default: value } },
              },
            }),
          ).rejects.toMatchObject({
            name: "CmxPublicationError",
            message: expect.stringContaining("JSON"),
          });
        },
      );
      expect(requests).toBe(0);
    },
  );

  it("recovers on the next publish after the host commits but its acknowledgement is lost", async () => {
    const empty = await createCmxPublicationState({});
    let active = empty;
    let puts = 0;
    await withEndpoint(
      (request, response) => {
        if (request.method === "GET") {
          if (active.contentHash === unicodeContentHash) {
            response.writeHead(304).end();
            return;
          }
          response
            .writeHead(200, {
              "Content-Type": "application/json",
              ETag: `"${active.contentHash}"`,
            })
            .end(JSON.stringify(active));
        } else {
          puts += 1;
          active = {
            contentHash: unicodeContentHash,
            manifest: {
              "blog/über":
                "sha256:39b8799c96d781167618061206954520b840394e71b7b8aa9392510b38e71cdc",
            },
          };
          response.destroy();
        }
      },
      async (endpoint) => {
        const input = { endpoint, documents: { "blog/über": unicodeDocument } };
        await expect(publishCmxDocuments(input)).rejects.toMatchObject({
          name: "CmxPublicationError",
          cause: expect.any(Error),
        });
        await expect(publishCmxDocuments(input)).resolves.toEqual({
          contentHash: unicodeContentHash,
        });
      },
    );
    expect(puts).toBe(1);
  });

  it("lets a host reproduce hashes across entry and Document property insertion orders", async () => {
    const rebuilt: CmxDocument = {
      content: { default: { count: 2, tags: ["z", "a"], title: "Grüße 🌍" } },
      interface: { exports: { default: {} }, imports: {} },
      cmxVersion: 1,
      $schema: CMX_DOCUMENT_SCHEMA,
    };
    const documentHash =
      "sha256:39b8799c96d781167618061206954520b840394e71b7b8aa9392510b38e71cdc";
    const contentHash =
      "sha256:39b5a2007fda8cae547236e48abf2f2e491b2edae8d86376598358e5511bb963";
    const manifest = {
      "10": documentHash,
      "2": documentHash,
      blog: documentHash,
    };
    await expect(hashCmxDocument(rebuilt)).resolves.toBe(documentHash);
    await expect(hashCmxPublicationManifest(manifest)).resolves.toBe(
      contentHash,
    );
    await expect(
      createCmxPublicationState({
        blog: unicodeDocument,
        "2": unicodeDocument,
        "10": unicodeDocument,
      }),
    ).resolves.toEqual({ contentHash, manifest });
    await expect(
      createCmxPublicationState({ "10": rebuilt, "2": rebuilt, blog: rebuilt }),
    ).resolves.toEqual({ contentHash, manifest });
  });

  it.each(["GET", "PUT"])(
    "lets the caller cancel during the authenticated %s exchange",
    async (phase) => {
      const controller = new AbortController();
      const current = await createCmxPublicationState({});
      await withEndpoint(
        (request, response) => {
          expect(request.headers.authorization).toBe(
            "Bearer application-token",
          );
          if (request.method === phase) controller.abort();
          response.setHeader("Content-Type", "application/json");
          if (request.method === "GET") {
            response.setHeader("ETag", `"${current.contentHash}"`);
            response.end(JSON.stringify(current));
          } else {
            response.end(JSON.stringify({ contentHash: unicodeContentHash }));
          }
        },
        async (endpoint) => {
          await expect(
            publishCmxDocuments({
              endpoint,
              documents: { "blog/über": unicodeDocument },
              signal: controller.signal,
              fetch: (input, init) => {
                const headers = new Headers(init?.headers);
                headers.set("Authorization", "Bearer application-token");
                return fetch(input, { ...init, headers });
              },
            }),
          ).rejects.toMatchObject({
            name: "CmxPublicationError",
            cause: { name: "AbortError" },
          });
        },
      );
    },
  );
});
