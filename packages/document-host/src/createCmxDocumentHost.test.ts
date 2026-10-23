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

it.each(["verification", "manifest", "commit", "document"])(
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
      getDocument: async (name) => {
        if (failing && phase === "document" && name === "reference")
          throw new Error("private database detail");
        return memory.getDocument(name);
      },
      commit: async (publication) => {
        if (failing && phase === "commit")
          throw new Error("private database detail");
        return memory.commit(publication);
      },
    };
    const host = createCmxDocumentHost({
      store,
      verifyPublicationUpdate: async (_update, loadDocument) => {
        if (failing && phase === "verification")
          throw new Error("private policy detail");
        await loadDocument("reference");
        return { valid: true };
      },
    });
    const reference = document("related content");
    expect(
      (await publish(host, { home: document("old"), reference })).status,
    ).toBe(200);
    const current = await memory.getState();
    const target = await createCmxPublicationState({
      home: document("new"),
      reference,
    });
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

it("structurally rejects incoming Documents before application verification and preserves the accepted Publication", async () => {
  let verified = 0;
  const host = createCmxDocumentHost({
    store: createMemoryCmxDocumentStore(),
    verifyPublicationUpdate: () => {
      verified += 1;
      return { valid: true };
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
    accepted: document("fine"),
  });
  expect(rejected.status).toBe(422);
  expect(await rejected.json()).toMatchObject({
    diagnostics: {
      broken: [expect.objectContaining({ severity: "error" })],
    },
  });
  expect(verified).toBe(1);
  expect(await host.getDocument("home")).toEqual(document("accepted"));
  expect(await host.getDocument("accepted")).toBeUndefined();
  expect((await publish(host, { other: document("next") })).status).toBe(200);
  expect(verified).toBe(2);
  expect((await publish(host, {}, ["home"])).status).toBe(200);
  expect(verified).toBe(3);
});

it("lets the application compose UGC and Environment checks before accepting content", async () => {
  const verifyUgc = createCmxUgcVerifier();
  const host = createCmxDocumentHost({
    store: createMemoryCmxDocumentStore(),
    verifyPublicationUpdate: async (update) => {
      const incoming = update.upsert.article;
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
    diagnostics: [
      expect.objectContaining({ code: "missing-environment-dependency" }),
      expect.objectContaining({ code: "ugc-disallowed-element" }),
    ],
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
    verifyPublicationUpdate: async (update, loadDocument) => {
      const incoming = (await loadDocument("home"))!;
      retained.push(incoming, update.upsert.home);
      incoming.content.default = "changed through loader";
      update.upsert.home.content.default = "changed through update";
      update.remove.push("home");
      delete update.upsert.home;
      update.upsert.extra = document("extra Document");
      expect(await loadDocument("home")).toEqual(document("published"));
      return { valid: true };
    },
  });
  const original = document("published");
  const target = await createCmxPublicationState({ home: original });
  expect((await publish(host, { home: original })).status).toBe(200);
  original.content.default = "changed by caller";
  for (const value of retained)
    value.content.default = "changed after verification";
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

it("verifies a Publication Update through received changes and selective proposed Document reads", async () => {
  const memory = createMemoryCmxDocumentStore();
  const acceptedHost = createCmxDocumentHost({ store: memory });
  const accepted = {
    home: document("old home"),
    unchanged: document("unchanged page"),
    removed: document("removed page"),
    unneeded: document("do not load"),
  };
  expect((await publish(acceptedHost, accepted)).status).toBe(200);
  const state = await memory.getState();
  const upsert = Object.fromEntries([
    [
      "_site",
      document([
        "home",
        "added",
        "unchanged",
        "removed",
        "unknown",
        "__proto__",
        "constructor",
      ]),
    ],
    ["home", document("new home")],
    ["added", document("new page")],
    ["__proto__", document("prototype page")],
    ["constructor", document("constructor page")],
  ]);
  const target = await createCmxPublicationState({
    ...upsert,
    unchanged: accepted.unchanged,
    unneeded: accepted.unneeded,
  });
  const requested: string[] = [];
  let observed: unknown;
  const host = createCmxDocumentHost({
    store: {
      ...memory,
      async getDocument(name) {
        requested.push(name);
        if (name !== "unchanged") throw new Error("Unrequested storage read");
        return memory.getDocument(name);
      },
    },
    async verifyPublicationUpdate(update, loadDocument) {
      const site = await loadDocument("_site");
      const names = site!.content.default as string[];
      observed = {
        update,
        documents: await Promise.all(names.map(loadDocument)),
        unchangedAgain: await loadDocument("unchanged"),
      };
      return { valid: true };
    },
  });
  const response = await host.handlePublication(
    put({
      baseContentHash: state.contentHash,
      targetContentHash: target.contentHash,
      upsert,
      remove: ["removed"],
    }),
  );
  expect(response.status).toBe(200);
  expect(observed).toEqual({
    update: { upsert, remove: ["removed"] },
    documents: [
      upsert.home,
      upsert.added,
      accepted.unchanged,
      undefined,
      undefined,
      upsert.__proto__,
      upsert.constructor,
    ],
    unchangedAgain: accepted.unchanged,
  });
  expect(requested).toEqual(["unchanged"]);
});

it.each(["replaced", "removed"])(
  "reports a conflict when an unchanged Document is concurrently %s even if verification catches the read failure",
  async (change) => {
    const memory = createMemoryCmxDocumentStore();
    const acceptedHost = createCmxDocumentHost({ store: memory });
    const initial = { home: document("old"), related: document("old related") };
    expect((await publish(acceptedHost, initial)).status).toBe(200);
    const state = await memory.getState();
    const upsert = { home: document("proposed") };
    const target = await createCmxPublicationState({ ...initial, ...upsert });
    const host = createCmxDocumentHost({
      store: {
        ...memory,
        async getDocument(name) {
          const response =
            change === "replaced"
              ? await publish(acceptedHost, { related: document("concurrent") })
              : await publish(acceptedHost, {}, ["related"]);
          expect(response.status).toBe(200);
          return memory.getDocument(name);
        },
      },
      async verifyPublicationUpdate(_update, loadDocument) {
        await loadDocument("related").catch(() => undefined);
        return {
          valid: false,
          diagnostics: [
            {
              severity: "error",
              code: "app/related",
              message: "Related content is unavailable.",
            },
          ],
        };
      },
    });
    const response = await host.handlePublication(
      put({
        baseContentHash: state.contentHash,
        targetContentHash: target.contentHash,
        upsert,
        remove: [],
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      message: "Publication base has changed.",
    });
    expect(await acceptedHost.getDocument("home")).toEqual(initial.home);
    expect(await acceptedHost.getDocument("related")).toEqual(
      change === "replaced" ? document("concurrent") : undefined,
    );
  },
);

it.each(["synchronous", "asynchronous"])(
  "preserves the accepted Publication when %s verification rejects a required fallback removal",
  async (mode) => {
    const memory = createMemoryCmxDocumentStore();
    const acceptedHost = createCmxDocumentHost({ store: memory });
    const initial = { home: document("accepted"), "404": document("fallback") };
    expect((await publish(acceptedHost, initial)).status).toBe(200);
    const state = await memory.getState();
    const diagnostics = [
      {
        severity: "error" as const,
        code: "app/required-fallback",
        message: "The fallback must remain available.",
      },
    ];
    const host = createCmxDocumentHost({
      store: memory,
      verifyPublicationUpdate(update) {
        const result = update.remove.includes("404")
          ? { valid: false as const, diagnostics }
          : { valid: true as const };
        return mode === "synchronous" ? result : Promise.resolve(result);
      },
    });
    const response = await publish(host, { home: document("proposed") }, [
      "404",
    ]);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      message: "Publication Update rejected.",
      diagnostics,
    });
    expect(await host.getDocument("home")).toEqual(initial.home);
    expect(await host.getDocument("404")).toEqual(initial["404"]);
    expect(
      await (await host.handlePublication(new Request(endpoint))).json(),
    ).toEqual(state);
  },
);

it.each(["replacement", "empty update"])(
  "conflicts a stale %s after verification while retaining coherent repeated reads",
  async (kind) => {
    const memory = createMemoryCmxDocumentStore();
    const acceptedHost = createCmxDocumentHost({ store: memory });
    const initial = {
      home: document("accepted"),
      related: document("accepted related"),
    };
    expect((await publish(acceptedHost, initial)).status).toBe(200);
    const state = await memory.getState();
    const upsert = kind === "replacement" ? { home: document("proposed") } : {};
    const target = await createCmxPublicationState({ ...initial, ...upsert });
    let entered!: () => void;
    let release!: () => void;
    const verifying = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    const loaded: Array<CmxDocument | undefined> = [];
    let storageReads = 0;
    const host = createCmxDocumentHost({
      store: {
        ...memory,
        async getDocument(name) {
          storageReads += 1;
          return memory.getDocument(name);
        },
      },
      async verifyPublicationUpdate(_update, loadDocument) {
        const concurrent = await Promise.all([
          loadDocument("related"),
          loadDocument("related"),
        ]);
        loaded.push(...concurrent);
        concurrent[0]!.content.default = "verifier mutation";
        entered();
        await released;
        loaded.push(await loadDocument("related"));
        return { valid: true };
      },
    });
    const publishing = host.handlePublication(
      put({
        baseContentHash: state.contentHash,
        targetContentHash: target.contentHash,
        upsert,
        remove: [],
      }),
    );
    await verifying;
    try {
      expect(
        (await publish(acceptedHost, { related: document("concurrent") }))
          .status,
      ).toBe(200);
    } finally {
      release();
    }
    const response = await publishing;
    expect(response.status).toBe(409);
    expect(loaded.slice(1)).toEqual([initial.related, initial.related]);
    expect(storageReads).toBe(1);
    expect(await acceptedHost.getDocument("home")).toEqual(initial.home);
    expect(await acceptedHost.getDocument("related")).toEqual(
      document("concurrent"),
    );
  },
);

it("keeps lazy storage failures distinct from rejection even if the application catches the read error", async () => {
  const memory = createMemoryCmxDocumentStore();
  const acceptedHost = createCmxDocumentHost({ store: memory });
  expect(
    (await publish(acceptedHost, { home: document("accepted") })).status,
  ).toBe(200);
  const state = await memory.getState();
  const upsert = { added: document("proposed") };
  const target = await createCmxPublicationState({
    home: document("accepted"),
    ...upsert,
  });
  const host = createCmxDocumentHost({
    store: {
      ...memory,
      async getDocument() {
        throw new Error("private database detail");
      },
    },
    async verifyPublicationUpdate(_update, loadDocument) {
      await loadDocument("home").catch(() => undefined);
      return { valid: true };
    },
  });
  const response = await host.handlePublication(
    put({
      baseContentHash: state.contentHash,
      targetContentHash: target.contentHash,
      upsert,
      remove: [],
    }),
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    message: "Document publication failed.",
  });
  expect(await acceptedHost.getDocument("home")).toEqual(document("accepted"));
  expect(await acceptedHost.getDocument("added")).toBeUndefined();
  expect(await memory.getState()).toEqual(state);
});

it("contains a prefetched Document read failure when synchronous verification returns before awaiting it", async () => {
  const memory = createMemoryCmxDocumentStore();
  const acceptedHost = createCmxDocumentHost({ store: memory });
  expect(
    (await publish(acceptedHost, { home: document("accepted") })).status,
  ).toBe(200);
  const state = await memory.getState();
  const host = createCmxDocumentHost({
    store: {
      ...memory,
      async getDocument() {
        throw new Error("private database detail");
      },
    },
    verifyPublicationUpdate(_update, loadDocument) {
      void loadDocument("home");
      return { valid: true };
    },
  });
  const response = await host.handlePublication(
    put({
      baseContentHash: state.contentHash,
      targetContentHash: state.contentHash,
      upsert: {},
      remove: [],
    }),
  );
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({
    message: "Document publication failed.",
  });
  expect(await memory.getState()).toEqual(state);
});

it("rejects an incoherent lazy read when concurrent Publications restore the original base before acceptance", async () => {
  const memory = createMemoryCmxDocumentStore();
  const acceptedHost = createCmxDocumentHost({ store: memory });
  const initial = {
    home: document("accepted"),
    related: document("accepted related"),
  };
  expect((await publish(acceptedHost, initial)).status).toBe(200);
  const state = await memory.getState();
  const upsert = { home: document("proposed") };
  const target = await createCmxPublicationState({ ...initial, ...upsert });
  const host = createCmxDocumentHost({
    store: {
      ...memory,
      async getDocument(name) {
        expect(
          (await publish(acceptedHost, { related: document("intermediate") }))
            .status,
        ).toBe(200);
        const intermediate = await memory.getDocument(name);
        expect(
          (await publish(acceptedHost, { related: initial.related })).status,
        ).toBe(200);
        return intermediate;
      },
    },
    async verifyPublicationUpdate(_update, loadDocument) {
      await loadDocument("related").catch(() => undefined);
      return { valid: true };
    },
  });
  const response = await host.handlePublication(
    put({
      baseContentHash: state.contentHash,
      targetContentHash: target.contentHash,
      upsert,
      remove: [],
    }),
  );
  expect(response.status).toBe(409);
  expect(await acceptedHost.getDocument("home")).toEqual(initial.home);
  expect(await memory.getState()).toEqual(state);
});
