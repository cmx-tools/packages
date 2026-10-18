import { expect, it } from "vitest";
import {
  CMX_DOCUMENT_SCHEMA,
  verifyCmxDocumentEnvironment,
  type CmxDocument,
} from "@cmx-tools/contracts";
import {
  createCmxPublicationState,
  type CmxPublicationState,
} from "@cmx-tools/publish";
import { createCmxUgcVerifier } from "@cmx-tools/verify";
import {
  createCmxDocumentHost,
  createMemoryCmxDocumentStore,
  type CmxDocumentStore,
} from "@cmx-tools/document-host";

const endpoint = "http://localhost/cmx";
const emptyHash =
  "sha256:44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a";

function document(value: unknown): CmxDocument {
  return {
    $schema: CMX_DOCUMENT_SCHEMA,
    cmxVersion: 1,
    interface: { imports: {}, exports: { default: {} } },
    content: { default: value },
  };
}

function put(value: unknown): Request {
  return new Request(endpoint, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
}

async function publish(
  host: ReturnType<typeof createCmxDocumentHost>,
  upsert: Record<string, CmxDocument>,
  remove: string[] = [],
): Promise<Response> {
  const current = (await (
    await host.handlePublication(new Request(endpoint))
  ).json()) as CmxPublicationState;
  const complete = Object.fromEntries(
    await Promise.all(
      Object.keys(current.manifest)
        .filter((name) => !remove.includes(name))
        .map(async (name) => [name, await host.getDocument(name)]),
    ),
  );
  const target = await createCmxPublicationState({ ...complete, ...upsert });
  return host.handlePublication(
    put({
      baseContentHash: current.contentHash,
      targetContentHash: target.contentHash,
      upsert,
      remove,
    }),
  );
}

it("starts empty and lets publishers compare their target with the current ETag", async () => {
  const host = createCmxDocumentHost({ store: createMemoryCmxDocumentStore() });
  const response = await host.handlePublication(new Request(endpoint));
  expect(response.status).toBe(200);
  expect(response.headers.get("ETag")).toBe(`"${emptyHash}"`);
  expect(response.headers.get("Cache-Control")).toBe("no-cache");
  expect(await response.json()).toEqual({
    contentHash: emptyHash,
    manifest: {},
  });
  const unchanged = await host.handlePublication(
    new Request(endpoint, { headers: { "If-None-Match": `"${emptyHash}"` } }),
  );
  expect(unchanged.status).toBe(304);
  expect(await unchanged.text()).toBe("");
  expect(await host.getDocument("missing")).toBeUndefined();
});

it.each(["verification", "manifest", "commit"])(
  "contains unexpected %s failures and keeps the previous publication",
  async (phase) => {
    const memory = createMemoryCmxDocumentStore();
    let failing = false;
    const store: CmxDocumentStore = {
      ...memory,
      getState: async () => {
        if (failing && phase === "manifest")
          throw new Error("private database detail");
        return memory.getState();
      },
      commit: async (publication) => {
        if (failing && phase === "commit")
          throw new Error("private database detail");
        return memory.commit(publication);
      },
    };
    const host = createCmxDocumentHost({
      store,
      verifyIncomingDocument: () => {
        if (failing && phase === "verification")
          throw new Error("private policy detail");
        return { valid: true };
      },
    });
    expect((await publish(host, { home: document("old") })).status).toBe(200);
    const current = await memory.getState();
    const target = await createCmxPublicationState({ home: document("new") });
    failing = true;
    const result = await host.handlePublication(
      put({
        baseContentHash: current.contentHash,
        targetContentHash: target.contentHash,
        upsert: { home: document("new") },
        remove: [],
      }),
    );
    expect(result.status).toBe(500);
    expect(await result.json()).toEqual({
      message: "Document publication failed.",
    });
    expect(await host.getDocument("home")).toEqual(document("old"));
  },
);

it.each(["POST", "PATCH", "DELETE", "HEAD"])(
  "rejects unsupported %s requests before touching storage",
  async (method) => {
    const store = createMemoryCmxDocumentStore();
    const host = createCmxDocumentHost({
      store: {
        ...store,
        getState: () => {
          throw new Error("unavailable");
        },
      },
    });
    const response = await host.handlePublication(
      new Request(endpoint, { method }),
    );
    expect(response.status).toBe(405);
    expect(response.headers.get("Allow")).toBe("GET, PUT");
  },
);

it.each([
  { label: "weak validator", value: `W/"${emptyHash}"`, status: 304 },
  {
    label: "validator list",
    value: `"other,tag", W/"${emptyHash}"`,
    status: 304,
  },
  { label: "wildcard", value: "*", status: 304 },
  { label: "different validator", value: '"other"', status: 200 },
])("uses HTTP conditional matching for a $label", async ({ value, status }) => {
  const host = createCmxDocumentHost({ store: createMemoryCmxDocumentStore() });
  const response = await host.handlePublication(
    new Request(endpoint, { headers: { "If-None-Match": value } }),
  );
  expect(response.status).toBe(status);
  expect(response.headers.get("ETag")).toBe(`"${emptyHash}"`);
  expect(response.headers.get("Cache-Control")).toBe("no-cache");
});

it("activates additions, replacements and removals including nested and prototype-like entry names", async () => {
  const host = createCmxDocumentHost({ store: createMemoryCmxDocumentStore() });
  const entries = Object.fromEntries([
    ["blog/post", document("first")],
    ["__proto__", document("special")],
    ["constructor", document("another")],
  ]);
  expect((await publish(host, entries)).status).toBe(200);
  expect(await host.getDocument("__proto__")).toEqual(document("special"));
  expect(await host.getDocument("constructor")).toEqual(document("another"));
  expect(
    (await publish(host, { "blog/post": document("updated") }, ["__proto__"]))
      .status,
  ).toBe(200);
  expect(await host.getDocument("blog/post")).toEqual(document("updated"));
  expect(await host.getDocument("__proto__")).toBeUndefined();
  const cleared = await publish(host, {}, ["blog/post", "constructor"]);
  expect(cleared.status).toBe(200);
  expect(await cleared.json()).toEqual({ contentHash: emptyHash });
  expect(await host.getDocument("blog/post")).toBeUndefined();
});

it("rejects the whole publication with structural and application diagnostics grouped by entry", async () => {
  const inspected: unknown[] = [];
  const diagnostics = [
    {
      severity: "error" as const,
      code: "content-policy",
      message: "Content is blocked.",
    },
  ];
  const host = createCmxDocumentHost({
    store: createMemoryCmxDocumentStore(),
    verifyIncomingDocument: async (incoming) => {
      inspected.push(incoming.content.default);
      return incoming.content.default === "blocked"
        ? { valid: false, diagnostics }
        : { valid: true };
    },
  });
  expect((await publish(host, { home: document("accepted") })).status).toBe(
    200,
  );
  const invalid = {
    ...document("broken"),
    cmxVersion: 200,
  } as unknown as CmxDocument;
  const rejected = await publish(host, {
    broken: invalid,
    policy: document("blocked"),
    accepted: document("fine"),
  });
  expect(rejected.status).toBe(422);
  expect(await rejected.json()).toMatchObject({
    diagnostics: {
      broken: [expect.objectContaining({ severity: "error" })],
      policy: diagnostics,
    },
  });
  expect(inspected).toEqual(["accepted", "blocked", "fine"]);
  expect(await host.getDocument("home")).toEqual(document("accepted"));
  expect(await host.getDocument("accepted")).toBeUndefined();
  expect((await publish(host, { other: document("next") })).status).toBe(200);
  expect(inspected).toEqual(["accepted", "blocked", "fine", "next"]);
  expect((await publish(host, {}, ["home"])).status).toBe(200);
  expect(inspected).toEqual(["accepted", "blocked", "fine", "next"]);
});

it("lets the application compose UGC and Environment checks before accepting content", async () => {
  const verifyUgc = createCmxUgcVerifier();
  const host = createCmxDocumentHost({
    store: createMemoryCmxDocumentStore(),
    verifyIncomingDocument: async (incoming) => {
      const environment = verifyCmxDocumentEnvironment(incoming, {
        dependencies: [],
        imports: {},
      });
      const ugc = await verifyUgc(incoming);
      const diagnostics = [
        ...(environment.valid ? [] : environment.diagnostics),
        ...(ugc.valid ? [] : ugc.diagnostics),
      ];
      return diagnostics.length
        ? { valid: false, diagnostics }
        : { valid: true };
    },
  });
  const unsafe = document({
    type: "element",
    tag: "script",
    children: ["alert(1)"],
  });
  unsafe.interface.exports.default.slots = [[]];
  unsafe.interface.imports["@site/theme"] = {
    name: "@site/theme",
    specifier: "^1",
    version: "1.0.0",
  };
  const response = await publish(host, { article: unsafe });
  expect(response.status).toBe(422);
  expect(await response.json()).toMatchObject({
    diagnostics: {
      article: [
        expect.objectContaining({ code: "missing-environment-dependency" }),
        expect.objectContaining({ code: "ugc-disallowed-element" }),
      ],
    },
  });
  expect(await host.getDocument("article")).toBeUndefined();
  const unrestricted = createCmxDocumentHost({
    store: createMemoryCmxDocumentStore(),
  });
  expect((await publish(unrestricted, { article: unsafe })).status).toBe(200);
});

it("isolates verification and read values from the hash-addressed stored Documents", async () => {
  const retained: CmxDocument[] = [];
  const host = createCmxDocumentHost({
    store: createMemoryCmxDocumentStore(),
    verifyIncomingDocument: (incoming) => {
      retained.push(incoming);
      incoming.content.default = "changed by verifier";
      return { valid: true };
    },
  });
  const original = document("published");
  const target = await createCmxPublicationState({ home: original });
  expect((await publish(host, { home: original })).status).toBe(200);
  original.content.default = "changed by caller";
  retained[0].content.default = "changed after verification";
  const read = await host.getDocument("home");
  read!.content.default = "changed by reader";
  expect(await host.getDocument("home")).toEqual(document("published"));
  const current = await host.handlePublication(new Request(endpoint));
  expect(await current.json()).toEqual(target);
});

it("rejects stale bases and target hashes that do not describe the resulting collection", async () => {
  const host = createCmxDocumentHost({ store: createMemoryCmxDocumentStore() });
  const initial = { home: document("first") };
  const target = await createCmxPublicationState(initial);
  const invalidTarget = await host.handlePublication(
    put({
      baseContentHash: emptyHash,
      targetContentHash: emptyHash,
      upsert: initial,
      remove: [],
    }),
  );
  expect(invalidTarget.status).toBe(400);
  expect(await host.getDocument("home")).toBeUndefined();
  expect((await publish(host, initial)).status).toBe(200);
  const stale = await host.handlePublication(
    put({
      baseContentHash: emptyHash,
      targetContentHash: target.contentHash,
      upsert: initial,
      remove: [],
    }),
  );
  expect(stale.status).toBe(409);
  expect(await host.getDocument("home")).toEqual(document("first"));
});

it.each([
  { label: "malformed JSON", body: "{" },
  { label: "null envelope", body: "null" },
  { label: "missing fields", body: "{}" },
  {
    label: "numbers outside the canonical JSON range",
    body: JSON.stringify({
      baseContentHash: emptyHash,
      targetContentHash: emptyHash,
      upsert: { home: { ...document("valid"), extension: "OVERFLOW" } },
      remove: [],
    }).replace('"OVERFLOW"', "1e400"),
  },
  { label: "malformed base hash", changes: { baseContentHash: "incorrect" } },
  { label: "malformed target hash", changes: { targetContentHash: 1 } },
  { label: "array upsert", changes: { upsert: [] } },
  { label: "null upsert", changes: { upsert: null } },
  { label: "missing remove list", changes: { remove: null } },
  { label: "non-string removal", changes: { remove: [3] } },
  { label: "duplicate removals", changes: { remove: ["home", "home"] } },
  {
    label: "upsert and removal overlap",
    changes: { upsert: { home: document("new") }, remove: ["home"] },
  },
])(
  "rejects $label without changing the active state",
  async ({ body, changes }) => {
    const host = createCmxDocumentHost({
      store: createMemoryCmxDocumentStore(),
    });
    const request =
      body !== undefined
        ? new Request(endpoint, { method: "PUT", body })
        : put({
            baseContentHash: emptyHash,
            targetContentHash: emptyHash,
            upsert: {},
            remove: [],
            ...changes,
          });
    const result = await host.handlePublication(request);
    expect(result.status).toBe(400);
    expect(await result.json()).toMatchObject({ message: expect.any(String) });
    expect(
      await (await host.handlePublication(new Request(endpoint))).json(),
    ).toEqual({ contentHash: emptyHash, manifest: {} });
  },
);
