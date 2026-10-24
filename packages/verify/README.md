# @cmx-tools/verify

Verify stored CMX Documents separately from application content restrictions:

```ts
import { assertCmxDocument, assertCmxUgc } from "@cmx-tools/verify";

const document: unknown = await response.json();
assertCmxDocument(document);
await assertCmxUgc(document);
```

Structural verification checks Document fields and node references. UGC verification restricts intrinsic elements, props, and URLs, including intrinsic nodes in declared component slots. Imported component props and ordinary metadata retain application meaning.

## Permit intrinsic HTML

CMX intrinsic `innerHTML` is rejected by default. Applications that accept raw HTML must explicitly permit it:

```ts
import { createCmxUgcVerifier, assertCmxUgc } from "@cmx-tools/verify";

const verifyUgc = createCmxUgcVerifier({
  dangerouslyAllowInnerHtml: true,
});
const result = await verifyUgc(document);

await assertCmxUgc(document, { dangerouslyAllowInnerHtml: true });
```

This permission does not sanitize HTML. It is independent of the build permission and is not stored in the Document. Other element, prop, and URL restrictions remain active.

## Select framework restrictions

Framework policies identify additional HTML insertion props. The same explicit allowance permits those props:

```ts
import { createCmxUgcVerifier } from "@cmx-tools/verify";
import { reactUgcPolicy } from "@cmx-tools/react";

const verifyUgc = createCmxUgcVerifier({
  policy: reactUgcPolicy,
  dangerouslyAllowInnerHtml: true,
});
```

Selecting `reactUgcPolicy` rejects `dangerouslySetInnerHTML` by default. Without that policy, the base verifier does not inspect the React prop.

Custom `CmxUgcPolicy` values supply `disallowedProps` and optional `innerHtmlProps`. Explicit `disallowedProps` always take precedence over the HTML allowance.
