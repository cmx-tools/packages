# Asset preprocessing

Import existing files into Content Source and receive metadata and final file URLs from a project-defined processor.

```sh
pnpm add -D @cmx-tools/assets @cmx-tools/cli
```

Configure processors and build-side storage in `cmx.config.ts`:

```ts
import {
  createLocalAssetStorage,
  defineCmxAssetProcessor,
} from "@cmx-tools/assets";
import type { CmxConfig } from "@cmx-tools/contracts";

export default {
  assets: {
    cacheDir: ".cmx/assets",
    storage: createLocalAssetStorage({
      directory: "public/assets",
      publicBaseUrl: "/assets",
    }),
    processors: {
      svg: defineCmxAssetProcessor({
        version: "1",
        extensions: [".svg"],
        process({ bytes, file }) {
          return { src: file(".svg"), size: bytes.byteLength };
        },
      }),
    },
  },
} satisfies CmxConfig;
```

Keep the default export's inferred type with `satisfies CmxConfig`. Annotating it as `CmxConfig` erases the processor's imported metadata fields. JavaScript ESM configs in `.js` or `.mjs` files can export the same object and use JSDoc to declare metadata types. CommonJS `module.exports`, config functions, and configuration merged from other sources are unsupported for Asset type generation.

`file(extension)` references the original bytes. `emit(bytes, extension)` references a processed output. The result can contain these references inside JSON objects and arrays. The build stores referenced files and replaces their references with URL strings. The [example SVG processor](../../example/svgAssetProcessor.ts) extracts dimensions and creates a smaller preview.

Processor keys identify processing behavior. Each processor declares a `version`, supported `extensions`, optional JSON `options`, and `process`. The processor receives `bytes`, `options`, `file`, and `emit`. Include every value affecting processing in `options`. Change `version` when processing behavior or external tools change.

## Typechecking and development

Enable `allowArbitraryExtensions` in the Content Project's TypeScript compiler options. For JavaScript ESM configs, also enable `allowJs` for content typechecking so generated declarations can import the config's inferred types. Prepare imports before typechecking in CI and watch them during development:

```json
{
  "scripts": {
    "assets:prepare": "cmx-assets prepare \"pages/**/*.tsx\"",
    "typecheck": "pnpm run assets:prepare && tsc --noEmit",
    "dev": "cmx-assets prepare \"pages/**/*.tsx\" --watch"
  }
}
```

Use `--cwd` and `--config` for a different project directory or config location. The umbrella command is `cmx assets prepare`. Preparation processes imported Assets and generates sibling declarations such as `photo.d.svg.ts`, without uploading files. Generated types follow the processor's declared return type, including optional fields and unions. Ignore these generated files in Git and restore the processing cache in CI to reuse completed work.

`cmx-bundle compile` prepares types automatically when it loads a config file. Programmatic `compileCmxBundle` accepts `configPath` for the same behavior.

```tsx
import photo from "./photo.svg";

export default <img src={photo.src} alt={`${photo.size} bytes`} />;
```

## Storage and caching

The local adapter writes content-hashed files to `directory`. Serve that directory at `publicBaseUrl`. Local paths are relative to the build process's working directory.

For R2, replace `storage` with:

```ts
createR2AssetStorage({
  endpoint: process.env.R2_ENDPOINT!,
  bucket: process.env.R2_BUCKET!,
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  publicBaseUrl: "https://assets.example.com",
});
```

Import `createR2AssetStorage` from `@cmx-tools/assets`. Custom storage implements `store({ key, bytes }): Promise<string>` and returns the final URL after successful storage. Both supplied adapters reuse existing content-hashed files and reject conflicting bytes.

Processing is cached under `cacheDir`, defaulting to `.cmx/assets`, using source bytes, processor key, version, and options. Storage and final URLs are excluded. Development and production can reuse cached processing with different destinations. Builds finish storing referenced files before completing the Bundle; processing or storage errors fail compilation. Publish only after a successful compile, using `&&` before Document Rendering and publication.

Documents contain ordinary metadata and URL strings. Applications use their normal Document Contract and hydration flow. Hosting, authorization, and serving policy belong to the host.
