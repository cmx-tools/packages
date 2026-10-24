# @cmx-tools/remix

Hydrate CMX Documents into native Remix values, then render them with Remix:

```ts
import type { CmxNode } from "@cmx-tools/contracts";
import { cmx } from "@cmx-tools/remix";
import { renderToString } from "remix/component/server";

const page = cmx<{ default: CmxNode }>(document, environment);
const html = await renderToString(page.default);
```

The Environment supplies imported components. Omit it for Documents without imports. `cmx(document, environment?)` verifies the Contract and hydrates declared slots. Other component props and metadata retain their application-defined meaning.

## Raw HTML

CMX intrinsic `innerHTML: string` becomes Remix's native `unsafeHTML` value during Hydration. Ordinary text remains escaped. The adapter does not convert React's `dangerouslySetInnerHTML` prop.

Enable CMX intrinsic raw HTML in the Content Project's `cmx.config.ts`:

```ts
import type { CmxConfig } from "@cmx-tools/contracts";

export default {
  exports: {
    default: {
      required: true,
      type: { from: "@cmx-tools/contracts", import: "CmxNode" },
    },
  },
  dangerouslyAllowInnerHtml: true,
} satisfies CmxConfig;
```

Enable application permission separately when verifying UGC:

```ts
import { assertCmxUgc } from "@cmx-tools/verify";
import { cmx, remixUgcPolicy } from "@cmx-tools/remix";

await assertCmxUgc(document, {
  dangerouslyAllowInnerHtml: true,
  policy: remixUgcPolicy,
});
const page = cmx(document, environment);
```

Build and UGC permissions each default to `false`. The build setting stays out of the Document and grants no application permission. The allowance does not sanitize raw HTML; other UGC restrictions and explicit property denials still apply. Hydration neither runs UGC verification nor accepts a policy flag. Apply application verification before accepting untrusted Documents.
