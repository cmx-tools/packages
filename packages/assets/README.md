# Asset preprocessing

Import files with typed metadata and final URLs. `cmx-bundle compile` processes Assets, stores their files, and generates import types.

```sh
pnpm add -D @cmx-tools/assets @cmx-tools/bundle @cmx-tools/cli @cmx-tools/contracts @cmx-tools/intrinsics typescript
```

## cmx.config.ts

```ts
import {
  createLocalAssetStorage,
  defineCmxAssetProcessor,
} from "@cmx-tools/assets";
import type { CmxConfig } from "@cmx-tools/contracts";

export default {
  exports: {
    default: {
      required: true,
      type: { from: "@cmx-tools/contracts", import: "CmxNode" },
    },
  },
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
        options: { previewWidth: 120 },
        process({ bytes, file, emit, options }) {
          const svg = new TextDecoder().decode(bytes);
          const width = Number(svg.match(/\bwidth="(\d+)"/u)?.[1]);
          const height = Number(svg.match(/\bheight="(\d+)"/u)?.[1]);
          if (!width || !height) {
            throw new Error("SVG must declare width and height");
          }
          const preview = svg
            .replace(`width="${width}"`, `width="${options.previewWidth}"`)
            .replace(
              `height="${height}"`,
              `height="${(height * options.previewWidth) / width}"`,
            );
          return {
            src: file(".svg"),
            width,
            height,
            preview: emit(new TextEncoder().encode(preview), ".svg"),
          };
        },
      }),
    },
  },
} satisfies CmxConfig;
```

Keep `satisfies CmxConfig` to preserve the processor's inferred return type. See the [example SVG processor](../../example/svgAssetProcessor.ts) for the same pattern in a Content Project.

## pages/about.tsx

Colocate `photo.svg` with the Content Source:

```tsx
import photo from "./photo.svg";

export default (
  <img
    src={photo.src}
    width={photo.width}
    height={photo.height}
    alt="Portrait"
  />
);
```

`src` and `preview` are strings; `width` and `height` are numbers. Unknown fields fail typechecking. Rendered Documents contain these ordinary values.

## tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noEmit": true,
    "allowArbitraryExtensions": true,
    "jsx": "react-jsx",
    "jsxImportSource": "@cmx-tools/intrinsics"
  },
  "include": ["cmx.config.ts", "pages/**/*.tsx"]
}
```

## package.json

Build before running TypeScript. Watch uses the same compile flow:

```json
{
  "type": "module",
  "scripts": {
    "build": "cmx-bundle compile \"pages/**/*.tsx\" dist",
    "typecheck": "pnpm run build && tsc --noEmit",
    "dev": "cmx-bundle compile \"pages/**/*.tsx\" dist --watch"
  }
}
```

```sh
pnpm run typecheck
pnpm run dev
```

## .gitignore

```gitignore
.cmx/
public/assets/
**/*.d.svg.ts
```

Serve `public/assets` at `/assets`.

## R2 storage

Use this for `assets.storage`:

```ts
import { createR2AssetStorage } from "@cmx-tools/assets";

const storage = createR2AssetStorage({
  endpoint: process.env.R2_ENDPOINT!,
  bucket: process.env.R2_BUCKET!,
  accessKeyId: process.env.R2_ACCESS_KEY_ID!,
  secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  publicBaseUrl: "https://assets.example.com",
});
```

Custom storage implements `CmxAssetStorage`: `store({ key, bytes }): Promise<string>`. Return the final URL after storing the file successfully. Supplied adapters reuse matching content-hashed files.

## Cache and processor settings

| Setting          | Usage                                                    |
| ---------------- | -------------------------------------------------------- |
| `processors.svg` | Stable processor identity                                |
| `version`        | Change when processing behavior or external tools change |
| `options`        | JSON values affecting the processing result              |
| `cacheDir`       | Persist or restore this directory between CI builds      |

Cache key: source bytes + processor identity + version + options. Changing storage destinations reuses processing. `file(extension)` references original bytes; `emit(bytes, extension)` references processed bytes. Returned metadata must be JSON data.

Compile failure stops the build. Run Document Rendering and publication only after successful compilation with `&&`.

Type generation supports default ESM config objects. CommonJS `module.exports`, config functions, and merged configuration sources are unsupported.
