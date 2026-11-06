# Verify Publication Updates against a proposed Publication

The Document Host provides `verifyPublicationUpdate(update, publication)` to check a proposed Publication Update and its effects on related Documents. The `CmxProposedPublication` object exposes complete target membership and selective Document reads from the same proposal.

The [hannesdiem caller](https://github.com/Xiphe/hannesdiem/blob/3563b9434263c53726d541f94df731cb275bf9f4/website/app/document-host/ContentState.ts#L165-L184) derives routes from Document entry names and validates the complete proposed collection. It previously captured current manifest keys outside the hook, added upsert names and subtracted removals before loading Documents. CMX already computes target membership for verification and acceptance. Exposing it removes application-owned reconstruction while leaving routing, metadata and fallback rules in the application.

```ts
import { createCmxUgcVerifier } from "@cmx-tools/verify";

const verifyUgc = createCmxUgcVerifier();
const host = createCmxDocumentHost({
  store,

  async verifyPublicationUpdate(update, publication) {
    for (const document of Object.values(update.upsert)) {
      const result = verifyUgc(document);
      if (!result.valid) return result;
    }

    const fallback = await publication.loadDocument("404");
    if (!fallback) {
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

- `update.upsert` contains the received new and replaced Documents by entry name. `update.remove` contains removed entry names.
- `publication.getEntryNames()` synchronously returns `readonly string[]` containing every proposed entry, including additions, replacements and unchanged entries and excluding removals. Each call returns a fresh array with no guaranteed ordering.
- `publication.loadDocument(entryName)` returns `Promise<CmxDocument | undefined>` from the same proposed Publication.
- Added and replaced Documents use the received data. Unchanged Documents load from storage on demand. Removed and unknown entries return `undefined`.
- Enumeration is opt-in, reads no Document bodies and allocates an array proportional to the entry count. Verification reads only requested Documents and adds no complete manifest copy for the hook.
- Update values, entry inventories and loaded Documents are isolated copies. Application mutations do not change the proposal or later results.
- The hook accepts synchronous or asynchronous results. Rejection returns diagnostics with HTTP `422` and preserves the previous Documents and publication state. Concurrent changes remain publication conflicts.

Application checks compose in this hook. CMX structurally verifies incoming Documents before invoking the hook. The host binds unchanged Document reads to captured hashes and coordinates atomic acceptance with storage. Enumeration changes neither the storage interface nor the publication protocol. The terms Publication and Publication Update are defined in [CONTEXT.md](../../CONTEXT.md#publication).

This replaces the standalone loader argument and the earlier decision to exclude complete entry inventory. Callers migrate `loadDocument(name)` to `publication.loadDocument(name)`; callbacks using only the update need no change. Component introspection for deployment compatibility remains separate.

Initial hook: [#203](https://github.com/cmx-tools/packages/issues/203). The existing complete manifest and publication buffering have separate scale costs, assessed in [#210](https://github.com/cmx-tools/packages/issues/210).
