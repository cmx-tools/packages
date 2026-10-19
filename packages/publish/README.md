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

## CLI

Install the publisher and CMX CLI:

```sh
pnpm add -D @cmx-tools/cli @cmx-tools/publish
```

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

## Authentication

Your application authenticates requests before forwarding them to the Document Host. Configure `publish.fetch` in `cmx.config.ts` to send those requests using your application's authentication mechanism. The publisher uses this Fetch-compatible function for every protocol request and defaults to `globalThis.fetch`.

For example, if your endpoint accepts a Bearer token:

```ts
const token = process.env.CMX_PUBLISH_TOKEN;

export const authenticatedFetch: typeof globalThis.fetch = async (
  input,
  init,
) => {
  if (!token) {
    throw new Error("CMX_PUBLISH_TOKEN is required to publish");
  }

  const request = new Request(input, init);
  request.headers.set("Authorization", `Bearer ${token}`);
  return globalThis.fetch(request);
};

export default {
  publish: {
    fetch: authenticatedFetch,
  },
};
```

The config loader makes `.env` values available during config evaluation, so capture the token at module scope. Check it inside the transport so other CMX commands can load the same config without publishing credentials. Creating a `Request` from both arguments preserves the publisher's headers, body, and abort signal.

The CLI discovers `cmx.config.ts` from the working directory. Use `--config` to select a config file or `--cwd` to select a project:

```sh
cmx-publish documents.json https://example.com/_cmx/publication --config ./cmx.config.ts
cmx publish documents.json https://example.com/_cmx/publication --cwd ./content
```

For programmatic publication, pass the same transport as `publishCmxDocuments({ endpoint, documents, fetch: authenticatedFetch })`.

The transport owns credential acquisition, refresh, and authentication challenges. A final `401` or `403` response fails publication. CMX handles the publication protocol and conflict retries.

## Errors

`CmxPublicationError` extends `CmxError` and carries the HTTP `status`, entry-specific `diagnostics`, and underlying `cause` when available. Network failures and rejected Documents also throw this error.
