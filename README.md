# CMX

CMX turns content authored as JSX or TSX into static JSON Documents. An application combines those Documents with its own components during hydration and renders the result with its framework.

The source of truth stays in Git. The application owns its rendering and deployment.

## Import Assets with typed metadata

Configure a project-defined processor with `@cmx-tools/assets`, then import colocated files such as `import photo from "./photo.svg"`. Content Source receives the processor's typed metadata and final URLs. Processing is cached across builds, and local filesystem or R2 storage runs before Document Rendering. Applications render the resulting values through their normal Document Contract.

Run `cmx assets prepare "pages/**/*.tsx"` before typechecking, or add `--watch` during development. See the [Asset preprocessing guide](packages/assets/README.md) for configuration, generated types, caching, and storage.

## Publish content to your application

If your application already renders CMX Documents, add a Document Host to accept content updates without rebuilding or redeploying the application. Your content project builds and publishes Documents locally or in CI; the running application reads the latest accepted content.

### In the application

```sh
pnpm add @cmx-tools/document-host
```

Create one host for the lifetime of the server, shared by publication and page requests:

```ts
import {
  createCmxDocumentHost,
  createMemoryCmxDocumentStore,
} from "@cmx-tools/document-host";

export const documentHost = createCmxDocumentHost({
  store: createMemoryCmxDocumentStore(),
});
```

Mount the publication handler at `/_cmx/publication` using your framework's Fetch-compatible request and response handling. Forward both `GET` and `PUT` requests:

```ts
import { documentHost } from "./documentHost.js";

export function handlePublication(request: Request): Promise<Response> {
  return documentHost.handlePublication(request);
}
```

For a deployed endpoint, authenticate publication requests in the application before calling this handler.

For page requests, replace loading a build-time JSON file with a lookup by its existing Bundle entry name:

```ts
const document = await documentHost.getDocument("about");
```

Return a `404` when the lookup is `undefined`. Otherwise, pass the Document through your existing CMX hydration and framework rendering. The [example server](example/backend/server.tsx) shows this with React.

The memory store starts empty and loses its contents when the server stops. Use it for local development and publish again after restarting. For deployment, provide [persistent storage](packages/document-host/README.md#provide-storage). The same package guide explains [application verification hooks](packages/document-host/README.md#verify-incoming-content), including Environment and UGC checks before accepting content.

### In the content project

Add the publisher alongside your existing CMX build tools:

```sh
pnpm add -D @cmx-tools/cli @cmx-tools/publish
```

After your existing content build produces the Bundle in `dist`, render and publish it to the running application:

```sh
pnpm exec cmx-document render dist --complete-only | pnpm exec cmx-publish - http://localhost:3000/_cmx/publication
```

Publish only after a successful content build. In CI, run the same pipeline against your application's publication endpoint. For an authenticated endpoint, configure an [authenticated HTTP transport](packages/publish/README.md#authentication) in `cmx.config.ts`.

Always publish the complete collection. Entry names come from the Bundle; missing entries delete previously published Documents. The publisher transfers only new and changed Documents. `--complete-only` prevents a partial render from deleting content, and a rejected publication leaves the previous collection available.

Publish again after a content edit, then refresh the application page. The application keeps running throughout. See the [publisher guide](packages/publish/README.md) for file input and the programmatic API.

## Use CMX in a static site build

Build the CMX Documents before the static site in the same CI job:

```txt
Content Source in Git
→ compile a CMX Bundle
→ render CMX Documents
→ generate the application Environment
→ build the static site
→ deploy one site artifact
```

The generated Documents are build inputs. The static site build reads them and emits the final HTML. A content change therefore triggers the site build and deployment.

### Suggested repository layout

Keep the content and site in one repository while establishing the workflow:

```txt
cmx.config.ts
content/
  pages/
  package.json
site/
  .cmx/
    documents/
    environment.ts
  package.json
```

The content package can expose this build script:

```json
{
  "scripts": {
    "compile": "cmx-bundle compile \"pages/**/*.tsx\" dist --config ../cmx.config.ts",
    "render": "cmx-document render dist --out-dir ../site/.cmx/documents",
    "build": "pnpm run compile && pnpm run render"
  }
}
```

The site generates its Environment before the framework build:

```json
{
  "scripts": {
    "cmx:environment": "cmx-environment generate .cmx/environment.ts --config ../cmx.config.ts",
    "build": "pnpm run cmx:environment && <framework build command>"
  }
}
```

Run the packages in order from the repository root:

```sh
pnpm --filter content build
pnpm --filter site build
```

Use the actual package names in each filter. Add `--external` mappings to `cmx-environment generate` when a contract package has an application-specific implementation.

CI runs the same commands after installing dependencies. The resulting static output is the deployment artifact. Generated Documents can remain CI artifacts unless the application also needs them checked into Git.
