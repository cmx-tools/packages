# Contributing

## Run the publication example

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
