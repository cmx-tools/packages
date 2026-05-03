# content-management-jsx

JSX content compiles to CMX through a **bundler plugin** and a **document renderer**. The current pipeline stops at CMX documents. React rendering and HTML output are downstream app concerns.

## Quick start

```sh
pnpm install
pnpm test
```

## Packages

| Package                 | Role                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `cmx-contracts`         | Bundle, document, environment, dependency, parse, diagnostic, and verifier contracts.                     |
| `cmx-bundler`           | Rolldown/Rollup-compatible `cmx()` plugin; emits ESM chunks, sourcemaps, and `cmx-bundle.json` metadata.  |
| `cmx-document-renderer` | Reads a bundle directory, executes emitted artifacts with the CMX JSX runtime, and returns CMX documents. |
| `cmx-react`             | Contract stub for later React rendering; not part of the non-React bundle-to-document path.               |
| `cmx-runtime`           | Runtime protocol and JSX runtime subpath exports expected by compiled artifacts.                          |

## Bundle-to-document flow

1. A content repository builds TSX entries with Rolldown and `cmx()`.
2. The build output directory contains JavaScript chunks, sourcemaps, and `cmx-bundle.json`.
3. `renderCmxDocuments({ bundleDir })` accepts that directory and returns rendered CMX documents plus diagnostics.
4. The renderer does not store, publish, forward, or convert documents to HTML.

The `example/content` package shows one app-specific orchestration: build a bundle directory, render documents, then write JSON files into `example/backend/_db_content`. That filesystem handoff is example glue, not a package API. Other apps can store the returned documents in a database, forward them to a service, or keep them in memory.

`cmx-contracts` exposes the bundle, document, and environment artifact contracts so custom pipelines can inspect or validate handoffs without depending on package internals.

## Render results

`renderCmxDocuments` returns:

- `complete` when all entries rendered.
- `partial` when at least one entry rendered and at least one entry failed.
- `error` when artifact or runtime setup failed, or when zero entries rendered.

Integration tests use `renderCmxTestbed` in `test/renderCmxTestbed.ts` (Rolldown + `cmx` + `renderCmxDocuments`) as end-to-end smoke.

## Environment-only generation

Context: [#89](https://github.com/Xiphe/content-management-jsx/issues/89) and [#94](https://github.com/Xiphe/content-management-jsx/issues/94).

Rolldown still needs at least one input. For an environment-only job, pass a virtual no-op entry and enable `cmx({ environment })`:

```ts
import { rolldown } from "rolldown";
import { cmx } from "cmx-bundler";

const envOnlyEntry = "virtual:cmx-env-only-entry";
const build = await rolldown({
  input: envOnlyEntry,
  plugins: [
    {
      name: "cmx-env-only-entry",
      resolveId(source) {
        if (source === envOnlyEntry) {
          return source;
        }
      },
      load(id) {
        if (id === envOnlyEntry) {
          return "export {};\n";
        }
      },
    },
    cmx({
      cwd: "example/backend",
      externals: [
        {
          contract: "@example/backend-contract",
          implementation: "./api.js",
        },
        "@example/ui-library",
      ],
      metaType: {
        from: "@example/backend-contract",
        import: "Meta",
        optional: true,
      },
      environment: {
        fileName: "_gen_cmx_environment.ts",
      },
    }),
  ],
});

try {
  await build.write({
    dir: "example/backend",
    entryFileNames: ".cmx-env-only.js",
  });
} finally {
  await build.close();
}
```

Do not pass an empty `input` object or omit `input`; Rolldown will not run plugin output hooks without a valid build input. The generated no-op JS entry can be ignored by templates that only publish `_gen_cmx_environment.ts`.

Package-contract externals use package names as the public contract. A string external such as `"@example/ui-library"` means the contract and runtime implementation are the same package. Use `{ contract, implementation }` when the runtime module differs from the public contract package. CMX records documents and generated environments against the contract package. Bundle-side substitutes belong to the caller package or workspace setup, not CMX external config.

Smoke path:

```sh
corepack pnpm --filter cmx-bundler test -- -t "emits an environment module from a virtual env-only entry"
```

## Migration notes

`cmxGenerateEnvironmentSource`, `CmxGenerateEnvironmentSourceInput`, and `CmxGenerateEnvironmentSourceResult` are removed from `cmx-bundler`. Use Rolldown with `cmx({ environment: { fileName } })` instead.

Environment generation now uses `cmx()` options. Replace generator `entries` with plugin `externals`, using `{ contract, implementation }` when a local implementation satisfies a public package contract. Configure `metaType`, `cwd`, and `getIntegrity` on the same `cmx()` call used for content bundling or environment-only generation.
