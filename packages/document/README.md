# @cmx-tools/document

Render a compiled CMX Bundle into static Documents:

```ts
import { renderCmxDocuments } from "@cmx-tools/document";

const result = await renderCmxDocuments({ bundleDir: "dist" });
if (result.result !== "complete") {
  throw new Error(
    result.diagnostics.map((diagnostic) => diagnostic.message).join("\n"),
  );
}
const article = result.entries.article.document;
```

Intrinsic `innerHTML` is rejected by default. Set `dangerouslyAllowInnerHtml: true` in the [build configuration](../bundle/README.md) to carry permission through the Bundle. Document Rendering checks evaluated props, including spreads and intrinsic nodes in component slots.

Direct rendering calls require their own explicit permission:

```ts
import { renderCmxDocument } from "@cmx-tools/document";

const { document } = await renderCmxDocument({
  moduleUrl: new URL("./dist/article.js", import.meta.url),
  exports: {
    default: {
      required: true,
      type: { from: "@cmx-tools/contracts", import: "CmxNode" },
    },
  },
  dangerouslyAllowInnerHtml: true,
});
```

The allowance does not sanitize markup and does not appear in the Document. Application UGC verification requires [independent permission](../verify/README.md). Imported component props and metadata retain their application-defined meaning.
