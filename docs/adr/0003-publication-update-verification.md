# Verify Publication Updates with selective Document reads

The Document Host provides `verifyPublicationUpdate(update, loadDocument)` to check a proposed Publication Update and its effects on related Documents. Passing the received changes lets applications discover every incoming entry; selective reads avoid loading the complete Document collection or supplying a complete list of names.

```ts
import { createCmxUgcVerifier } from "@cmx-tools/verify";

const verifyUgc = createCmxUgcVerifier();
const host = createCmxDocumentHost({
  store,

  async verifyPublicationUpdate(update, loadDocument) {
    for (const document of Object.values(update.upsert)) {
      const result = verifyUgc(document);
      if (!result.valid) return result;
    }

    const fallback = await loadDocument("404");
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
- `loadDocument(entryName)` returns `Promise<CmxDocument | undefined>` from the consistent Document set that would result from accepting the update.
- Added and replaced Documents use the received data. Unchanged Documents load from storage on demand. Removed and unknown entries return `undefined`.
- Verification reads only requested Documents. Reuse available data without adding a complete collection read, name list or manifest copy for the hook.
- The hook accepts synchronous or asynchronous results. Rejection returns diagnostics with HTTP `422` and preserves the previous Documents and publication state. Concurrent changes remain publication conflicts.

Application checks compose in this hook, replacing `verifyIncomingDocument`. CMX structurally verifies incoming Documents before invoking the hook. The host coordinates consistent verification and atomic acceptance with storage. The terms Publication and Publication Update are defined in [CONTEXT.md](../../CONTEXT.md#publication).

Implementation: [#203](https://github.com/cmx-tools/packages/issues/203). The existing complete manifest and publication buffering have separate scale costs, assessed in [#210](https://github.com/cmx-tools/packages/issues/210).
