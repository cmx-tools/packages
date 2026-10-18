# CMX

CMX turns content authored as JSX or TSX into static JSON Documents. An application combines those Documents with its own components during hydration and renders the result with its framework.

The source of truth stays in Git. The application owns its rendering and deployment.

## Publish content to the running example

From the repository root, install dependencies and build the packages:

```sh
pnpm install
pnpm build
```

Start the local application in one terminal:

```sh
pnpm example:host
```

In another terminal, build and publish the example content:

```sh
pnpm example:publish
```

Open [the about page](http://127.0.0.1:3000/about). Edit `example/content/pages/about.tsx`, publish again, and refresh the page. The application keeps running while the published content changes. Removing a page from the content source removes it on the next publication. A failed build does not publish.

The host starts empty and stores Documents in memory. Publish again after restarting it. The local publication endpoint has no authentication and is intended for local development.

For a different port, start with `PORT=3001 pnpm example:host` and publish with `CMX_PUBLISH_ENDPOINT=http://127.0.0.1:3001/_cmx/publication pnpm example:publish`.

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
