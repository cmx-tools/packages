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
      externals: ["@example/backend-contract", "@example/ui-library"],
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

Smoke path:

```sh
corepack pnpm --filter cmx-bundler test -- -t "emits an environment module from a virtual env-only entry"
```
