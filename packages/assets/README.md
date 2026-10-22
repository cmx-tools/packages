# Asset preprocessing

Project processors read imported files and return typed JSON. They own transformations and storage. CMX caches the result and generates import declarations during the normal build.

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
  async process({ bytes, relativePath, options }) {
    const source = new TextDecoder().decode(bytes);
    const width = Number(source.match(/\bwidth="(\d+)"/u)?.[1]);
    const height = Number(source.match(/\bheight="(\d+)"/u)?.[1]);
    if (!width || !height)
      throw new Error(`Missing SVG dimensions: ${relativePath}`);
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

`relativePath` is relative to the Content Project, includes the extension, and uses `/` separators. The [example processor](../../example/svgAssetProcessor.ts) also stores a smaller preview and returns a `srcset` string.

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

Documents contain the returned values. Hosts using UGC verification must explicitly allow `img`. Enable `compilerOptions.allowArbitraryExtensions` for generated Asset declarations.

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

The cache key includes source bytes, `relativePath`, processor key, `version`, and JSON `options`. A hit skips the entire hook, including storage. Include the destination and every other value affecting the result in `options`; changing those values reruns the hook. Change `version` when processing behavior or external tools change. Persist or restore `assets.cacheDir`, defaulting to `.cmx/assets`, between builds.

Restore project-owned local files alongside the cache. CMX does not recreate stored files on a hit.

Return only JSON data and finish storage before returning URLs. A hook failure stops compilation; run Document Rendering and publication only after successful compilation with `&&`.

Type generation supports default ESM config objects. CommonJS `module.exports`, config functions, and merged configuration sources are unsupported.
