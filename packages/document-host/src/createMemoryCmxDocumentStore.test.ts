import { expect, it } from "vitest";
import { CMX_DOCUMENT_SCHEMA, type CmxDocument } from "@cmx-tools/contracts";
import { createCmxPublicationState } from "@cmx-tools/publish";
import { createMemoryCmxDocumentStore } from "@cmx-tools/document-host";

it("preserves committed snapshots when an adapter caller mutates arguments or returned values", async () => {
  const store = createMemoryCmxDocumentStore();
  const old = await store.getState();
  const document: CmxDocument = {
    $schema: CMX_DOCUMENT_SCHEMA,
    cmxVersion: 1,
    interface: { imports: {}, exports: { default: {} } },
    content: { default: "accepted" },
  };
  const target = await createCmxPublicationState({ home: document });
  const expected = structuredClone(target);
  expect(
    await store.commit({
      baseContentHash: old.contentHash,
      target,
      upsert: { home: document },
      remove: [],
    }),
  ).toBe(true);
  document.content.default = "caller mutation";
  target.manifest.home = "caller mutation";
  const read = await store.getDocument("home");
  read!.content.default = "reader mutation";
  const state = await store.getState();
  state.manifest.home = "reader mutation";
  expect((await store.getDocument("home"))!.content.default).toBe("accepted");
  expect(await store.getState()).toEqual(expected);
  expect(
    await store.commit({
      baseContentHash: old.contentHash,
      target: old,
      upsert: {},
      remove: ["home"],
    }),
  ).toBe(false);
  expect(await store.getState()).toEqual(expected);
  expect(await store.getDocument("constructor")).toBeUndefined();
});
