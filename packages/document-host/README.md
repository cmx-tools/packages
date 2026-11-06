# @cmx-tools/document-host

Accept published CMX Documents in your application and read updated content without restarting it.

```sh
pnpm add @cmx-tools/document-host
```

Create one host for the lifetime of your server:

```ts
import {
  createCmxDocumentHost,
  createMemoryCmxDocumentStore,
} from "@cmx-tools/document-host";

const host = createCmxDocumentHost({
  store: createMemoryCmxDocumentStore(),
});
```

Mount `host.handlePublication(request)` at an application-selected endpoint. The handler accepts standard Fetch `Request` values and returns `Response` values. Authenticate requests in the surrounding application before calling it.

Publish a complete entry map from another process:

```sh
cmx publish documents.json http://localhost:3000/cmx
```

Read the current Document by its existing Bundle entry name:

```ts
const document = await host.getDocument("blog/post");
if (document === undefined) {
  return new Response("Not found", { status: 404 });
}
```

The application owns routing and rendering. The in-memory store starts empty and loses its contents when the process stops. Publish again after restarting it.

## Verify Publication Updates

Every added or replaced Document receives deep structural verification. Supply `verifyPublicationUpdate` to apply application rules after that verification:

```ts
import { verifyCmxDocumentEnvironment } from "@cmx-tools/contracts";
import { createCmxUgcVerifier } from "@cmx-tools/verify";

const verifyUgc = createCmxUgcVerifier();
const host = createCmxDocumentHost({
  store: createMemoryCmxDocumentStore(),
  async verifyPublicationUpdate(update, publication) {
    for (const document of Object.values(update.upsert)) {
      const compatible = verifyCmxDocumentEnvironment(document, environment);
      if (!compatible.valid) return compatible;
      const ugc = await verifyUgc(document);
      if (!ugc.valid) return ugc;
    }

    if (!(await publication.loadDocument("404"))) {
      return {
        valid: false,
        diagnostics: [
          {
            severity: "error",
            code: "app/missing-fallback",
            message: "The required 404 Document is missing.",
          },
        ],
      };
    }
    return { valid: true };
  },
});
```

`update.upsert` contains received new and replaced Documents by entry name. `update.remove` contains removed entry names. The second argument is a `CmxProposedPublication`:

- `publication.getEntryNames()` synchronously returns the complete proposed entry inventory, including additions and unchanged entries and excluding removals. Each call returns a fresh array with no guaranteed ordering. Listing names performs no Document reads and allocates an array proportional to the entry count only when called.
- `publication.loadDocument(entryName)` reads that same proposed Publication. It reuses incoming Documents, loads unchanged Documents on demand, and returns `undefined` for removed or unknown names.

Applications can validate every proposed entry without reading the current manifest or applying the delta themselves. Inside the hook, build the application validator's entry map on demand:

```ts
const documents = new Map<string, CmxDocument>();
for (const entryName of publication.getEntryNames()) {
  const document = await publication.loadDocument(entryName);
  if (document !== undefined) documents.set(entryName, document);
}
const proposedDocuments = Object.fromEntries(documents);
```

Import `CmxDocument` from `@cmx-tools/contracts`. The application owns routing, metadata and validation rules. Listing names alone loads no Documents; this loop explicitly loads the complete proposed collection.

Update values, entry inventories and loader results are isolated copies. Mutations do not transform published content or subsequent results. Verification accepts synchronous or asynchronous `{ valid: true }` or `{ valid: false, diagnostics }` results.

Application rejection returns HTTP `422` with a flat `diagnostics` array. Structural rejection returns `422` with diagnostics grouped by entry name. Both preserve the previous Publication. Malformed requests receive `400`, publication conflicts receive `409`, and unexpected failures receive `500`.

### Migrate from 0.2

The second hook argument is now a proposed Publication object instead of a loader function. Replace `verifyPublicationUpdate(update, loadDocument)` with `verifyPublicationUpdate(update, publication)` and `loadDocument(name)` with `publication.loadDocument(name)`. Callbacks that only use `update` need no change.

## Provide storage

Implement `CmxDocumentStore` to use persistent storage. `getState` returns the current manifest and content hash, and `getDocument` returns a current Document or `undefined`. Return snapshots that callers can safely mutate.

`commit` atomically compares `baseContentHash` with the current hash and applies the supplied upserts, removals, and target state. Return `false` when the base changed. Readers must see the complete previous or next state. A failed commit must preserve the previous state.

The host binds requested unchanged Documents to their captured manifest hashes and checks the base again through atomic commit. A missing or mismatched unchanged Document produces a publication conflict. Storage adapters provide persistence and atomicity; application diagnostics belong in the verification hook.
