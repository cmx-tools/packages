# @cmx-tools/markdown-renderers

Default host bindings for Markdown elements produced by `@cmx-tools/markdown`.

```sh
pnpm add @cmx-tools/markdown-renderers
```

```tsx
import { defaultCmxMarkdown } from "@cmx-tools/markdown-renderers";

const imports = {
  "@my-app/prose": {
    ...defaultCmxMarkdown,
    h1: MyHeading,
  },
};
```

The map binds every supported Markdown element to its native tag string. Hosts can override individual bindings. These bindings work with CMX framework adapters.

This package has zero dependencies. The Markdown parser and authoring runtime belong to the separate `@cmx-tools/markdown` package used in the content project.
