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

## Verify incoming content

Every added or replaced Document receives deep structural verification. Supply a `CmxVerifyDocument` callback to apply application checks after that verification:

```ts
import { verifyCmxDocumentEnvironment } from "@cmx-tools/contracts";
import { createCmxUgcVerifier } from "@cmx-tools/verify";

const verifyUgc = createCmxUgcVerifier();
const host = createCmxDocumentHost({
  store: createMemoryCmxDocumentStore(),
  async verifyIncomingDocument(document) {
    const compatible = verifyCmxDocumentEnvironment(document, environment);
    if (!compatible.valid) return compatible;
    return verifyUgc(document);
  },
});
```

The callback receives an isolated copy. Changes to that copy do not transform published content. Unchanged Documents retain their earlier acceptance.

A rejected Document rejects the complete publication with HTTP `422` and diagnostics grouped by entry name. The previous publication remains available. Malformed publication requests receive `400`, stale publications receive `409`, and unexpected failures receive `500`.

## Provide storage

Implement `CmxDocumentStore` to use persistent storage. `getState` returns the current manifest and content hash, and `getDocument` returns a current Document or `undefined`. Return snapshots that callers can safely mutate.

`commit` atomically compares `baseContentHash` with the current hash and applies the supplied upserts, removals, and target state. Return `false` when the base changed. Readers must see the complete previous or next state. A failed commit must preserve the previous state.

The host computes and verifies hashes and content before calling the store. Storage adapters provide persistence and atomicity.
