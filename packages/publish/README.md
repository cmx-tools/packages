# @cmx-tools/publish

Publish content changes to a running application without rebuilding or redeploying its code. Pass the complete CMX Document entry map produced by your content build.

```ts
import { publishCmxDocuments } from "@cmx-tools/publish";

const { contentHash } = await publishCmxDocuments({
  endpoint: "http://localhost:3000/cmx",
  documents,
});
```

Entry names come from the Bundle. Missing entries are deleted. The publisher sends only new and changed Documents. The host verifies incoming Documents before committing the collection.

Pass an optional `signal: AbortSignal` to cancel the operation or apply the caller's deadline to both HTTP requests.

```sh
cmx-publish documents.json http://localhost:3000/cmx
cmx publish documents.json http://localhost:3000/cmx
```

`documents.json` contains the complete entry map produced by `cmx-document render`. Successful commands print `{ "contentHash": "sha256:…" }`. Failures exit with code 1 and print diagnostics to stderr.

Use `-` to read the entry map from stdin:

```sh
cmx-document render dist --complete-only | cmx-publish - http://localhost:3000/cmx
cmx-document render dist --complete-only | cmx publish - http://localhost:3000/cmx
```

`--complete-only` emits Documents only when every entry renders successfully. Always use it when piping into publication: partial render output would otherwise delete the host's entries that failed to render. A failed build leaves stdin empty, so publication fails without contacting the host.

`CmxPublicationError` extends `CmxError` and carries the HTTP `status`, entry-specific `diagnostics`, and underlying `cause` when available. Network failures and rejected Documents also throw this error.
