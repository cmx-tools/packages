# content-management-jsx

## Quick start

```sh
npm install
npm test
```

## `transpileModule`

Use `transpileModule` to turn a TSX content module into a CMX tree.

```ts
import path from "node:path";
import { transpileModule } from "content-management-jsx";

const result = await transpileModule({
  entryFile: path.resolve("content/home.tsx"),
  externals: ["@theme/ui", "@cms/blocks/**"],
});

if (result.result === "error") {
  console.error(result.diagnostics);
  process.exitCode = 1;
} else {
  console.log(result.tree);
  console.log(result.meta);
  console.log(result.manifest);
}
```

The entry module must have a default export. The default export may be JSX,
a CMX-compatible primitive, an array, or a function returning one of those
values.

```tsx
import { Hero } from "@theme/ui";

export const meta = {
  slug: "home",
};

export default function Page() {
  return (
    <main>
      <Hero title="Home" />
    </main>
  );
}
```

### Options

- `entryFile`: absolute path to the TSX module.
- `fs`: optional virtual file system with `readFile(filePath)`.
- `externals`: module specifiers or glob patterns kept as CMX component refs.
- `unsupportedValues`: `"error"` by default; use `"omit"` to drop unsupported
  prop or meta values.

### Result

Success returns `{ result: "tree", tree, meta?, manifest, diagnostics }`.

Errors return `{ result: "error", diagnostics }`.
