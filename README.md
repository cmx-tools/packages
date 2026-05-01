# content-management-jsx

JSX content compiles to CMX through a **bundler plugin** and a **document renderer**. The repository root is a private workspace shell.

## Quick start

```sh
pnpm install
pnpm test
```

## Packages

| Package                 | Role                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `cmx-contracts`         | Shared CMX contract types, `cmx-bundle.json` parse surface, diagnostics.                                 |
| `cmx-bundler`           | Rolldown/Rollup-compatible `cmx()` plugin; emits ESM chunks, sourcemaps, and `cmx-bundle.json` metadata. |
| `cmx-document-renderer` | Executes emitted artifacts with an external CMX JSX runtime; emits CMX documents.                        |
| `cmx-runtime`           | Runtime protocol and JSX runtime subpath exports expected by compiled artifacts.                         |

## Render results

`renderCmxDocuments` returns:

- `complete` when all entries rendered.
- `partial` when at least one entry rendered and at least one entry failed.
- `error` when artifact or runtime setup failed, or when zero entries rendered.

Integration tests use `renderCmxTestbed` in `test/renderCmxTestbed.ts` (Rolldown + `cmx` + `renderCmxDocuments`) as end-to-end smoke.
