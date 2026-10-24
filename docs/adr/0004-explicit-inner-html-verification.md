# Require explicit permission for intrinsic innerHTML

CMX authoring uses `innerHTML: string`. Require `dangerouslyAllowInnerHtml: true` during build and UGC verification because this value inserts markup rather than escaped text. Framework-specific verification belongs to the selected framework policy; adapters perform value conversion during Hydration.

```tsx
<div innerHTML="<strong>Hello</strong>" />
```

Enable the build permission in `cmx.config.ts`:

```ts
import type { CmxConfig } from "@cmx-tools/contracts";

export default {
  dangerouslyAllowInnerHtml: true,
} satisfies CmxConfig;
```

Configure application verification independently:

```ts
import { createCmxUgcVerifier } from "@cmx-tools/verify";
import { reactUgcPolicy } from "@cmx-tools/react";

const verifyUgc = createCmxUgcVerifier({
  dangerouslyAllowInnerHtml: true,
  policy: reactUgcPolicy,
});
```

- Both permissions default to `false`. Rejection produces diagnostics rather than removing the prop. The build permission does not grant application permission or travel inside the Document.
- The build check covers CMX intrinsic `innerHTML` only. Enforce it during Document Rendering, after props are evaluated, including spreads and intrinsic nodes in declared slots. Carry build configuration through the Bundle and enforce the same default for direct rendering calls.
- Base UGC verification checks CMX `innerHTML`, including when no framework policy is selected. It does not acquire framework-specific checks.
- A selected framework policy identifies its additional HTML insertion props. The same verifier option permits those forms. The React policy governs `dangerouslySetInnerHTML`; without that policy, the base verifier does not inspect that React-specific prop. Other UGC restrictions remain active, and explicitly disallowed props remain disallowed.
- Remix converts CMX `innerHTML: string` to its native `unsafeHTML` value. React retains its existing conversion to `dangerouslySetInnerHTML` and support for React-authored props. Remix gains no React-specific prop conversion in this work.
- Adapter Hydration keeps `cmx(document, environment?)`. It performs Contract Verification and value conversion, with no new content-policy option or automatic UGC verification. Structural Document Verification remains policy-free.
- These checks and conversions apply to intrinsic nodes, including nodes in declared slots. Imported component props and ordinary metadata retain their application-defined meaning.

Implement through [#193](https://github.com/cmx-tools/packages/issues/193). This refines raw HTML verification within [ADR 0002](0002-opt-in-cmx-intrinsic-authoring.md).
