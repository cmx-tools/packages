# content-management-jsx

JSX content compiles to CMX through a **bundler plugin** (artifact emission) and a **tree renderer** (artifact execution). There is no package root export; import subpaths explicitly.

## Quick start

```sh
pnpm install
pnpm test
```

## Package exports

| Subpath                                    | Role                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| `content-management-jsx/cmx-bundler`       | Rolldown/Rollup-compatible `cmx()` plugin; emits ESM chunks, sourcemaps, and `cmx-bundle.json` metadata. |
| `content-management-jsx/cmx-tree-renderer` | Executes emitted artifacts with an external CMX JSX runtime; normalizes to plain CMX trees.              |
| `cmx-runtime/jsx-runtime`                  | JSX runtime entry expected by compiled artifacts.                                                        |

## Render results

`renderCmxBundle` returns:

- `complete` when all entries rendered.
- `partial` when at least one entry rendered and at least one entry failed.
- `error` when artifact or runtime setup failed, or when zero entries rendered.

Integration tests use `renderCmxTestbed` in `src/renderCmxTestbed.ts` (Rolldown + `cmx` + `renderCmxBundle`) as end-to-end smoke.
