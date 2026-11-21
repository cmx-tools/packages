# @cmx-tools/contracts

Shared CMX document and toolchain contracts.

## Markdown defaults

Import optional Markdown component bindings through the explicit subpath:

```ts
import { defaultCmxMarkdown } from "@cmx-tools/contracts/markdown";
```

The map binds supported Markdown component names to native tag strings. Spread it
into the contract's Environment import bindings and override individual entries as
needed. This subpath adds no dependencies and is independent of Markdown parsing.
