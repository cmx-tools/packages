# @cmx-tools/react

Hydrate CMX Documents into native React values, then render them with React:

```ts
import type { CmxNode } from "@cmx-tools/contracts";
import { cmx } from "@cmx-tools/react";
import { renderToStaticMarkup } from "react-dom/server";

const page = cmx<{ default: CmxNode }>(document, environment);
const html = renderToStaticMarkup(page.default);
```

The Environment supplies imported components. Omit it for Documents without imports. `cmx(document, environment?)` verifies the Contract and hydrates declared slots. Other component props and metadata retain their application-defined meaning.

## Raw HTML

CMX intrinsic `innerHTML: string` becomes React's `dangerouslySetInnerHTML` prop during Hydration. React-authored props remain supported. Ordinary text remains escaped.

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
import { cmx, reactUgcPolicy } from "@cmx-tools/react";

await assertCmxUgc(document, {
  dangerouslyAllowInnerHtml: true,
  policy: reactUgcPolicy,
});
const page = cmx(document, environment);
```

Build and UGC permissions each default to `false`. The build checks CMX intrinsic `innerHTML` only. Selecting `reactUgcPolicy` also restricts React's `dangerouslySetInnerHTML`; the same verifier allowance permits both forms. Base UGC verification alone does not inspect that React-specific prop.

The build setting stays out of the Document and grants no application permission. The allowance does not sanitize raw HTML; other UGC restrictions and explicit property denials still apply. Hydration neither runs UGC verification nor accepts a policy flag. Apply application verification before accepting untrusted Documents.
