# Asset preprocessing

Project processors read imported files and return typed JSON. They own transformations and storage. CMX caches the result and generates import declarations during the normal build.

```sh
pnpm add -D @cmx-tools/assets @cmx-tools/bundle @cmx-tools/cli @cmx-tools/contracts @cmx-tools/intrinsics typescript @types/node
```

## cmx.config.ts

```ts
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CmxAssetProcessor, CmxConfig } from "@cmx-tools/contracts";

const svg = {
  version: "1",
  extensions: [".svg"],
  options: { directory: "public/assets", publicBaseUrl: "/assets" },
  async process({ bytes, name, options }) {
    const source = new TextDecoder().decode(bytes);
    const width = Number(source.match(/\bwidth="(\d+)"/u)?.[1]);
    const height = Number(source.match(/\bheight="(\d+)"/u)?.[1]);
    if (!width || !height) throw new Error(`Missing SVG dimensions: ${name}`);
    const key = `${createHash("sha256").update(bytes).digest("hex")}.svg`;
    await mkdir(options.directory, { recursive: true });
    await writeFile(path.join(options.directory, key), bytes);
    return { src: `${options.publicBaseUrl}/${key}`, width, height };
  },
} satisfies CmxAssetProcessor<{ directory: string; publicBaseUrl: string }>;

export default {
  exports: {
    default: {
      required: true,
      type: { from: "@cmx-tools/contracts", import: "CmxNode" },
    },
  },
  assets: { processors: { svg } },
} satisfies CmxConfig;
```

Use `satisfies` to preserve the processor's inferred return type. `name` is the Asset's path relative to the Content Project, with `/` separators and its extension. `bytes` contains the source file; `options` contains the configured JSON values. The [example processor](../../example/svgAssetProcessor.ts) also creates and stores a smaller preview and returns a `srcset` string.

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

`src` is a string; `width` and `height` are numbers. Unknown fields and incompatible uses fail typechecking. Documents contain these ordinary values, ready for the application's normal hydration flow. An application using UGC verification must explicitly allow `img` in its element policy.

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
    "types": ["node"],
    "jsx": "react-jsx",
    "jsxImportSource": "@cmx-tools/intrinsics"
  },
  "include": ["cmx.config.ts", "pages/**/*.tsx"]
}
```

## package.json

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

Build generates declarations such as `photo.d.svg.ts` before TypeScript runs. Watch rebuilds source and Asset changes and reloads processor configuration.

## .gitignore

```gitignore
.cmx/
public/assets/
**/*.d.svg.ts
```

Serve `public/assets` at `/assets`.

The cache key includes source bytes, `name`, processor key, `version`, and JSON `options`. A hit skips the entire hook, including storage. Include the destination and every other value affecting the result in `options`; changing those values reruns the hook. Change `version` when processing behavior or external tools change. Persist or restore `assets.cacheDir`, defaulting to `.cmx/assets`, between builds.

Restore project-owned local files alongside the cache. CMX does not recreate stored files on a hit.

Return only JSON data and finish storage before returning URLs. A hook failure stops compilation; run Document Rendering and publication only after successful compilation with `&&`.

Type generation supports default ESM config objects. CommonJS `module.exports`, config functions, and merged configuration sources are unsupported.
