# @cmx-tools/bundle

Compile JSX content into a portable CMX Bundle, then render it with `@cmx-tools/document`.

```sh
pnpm add -D @cmx-tools/cli @cmx-tools/bundle @cmx-tools/document @cmx-tools/contracts
```

For editorial content that inserts raw markup, explicitly allow CMX intrinsic `innerHTML` in `cmx.config.ts`:

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

```tsx
export default <article innerHTML="<strong>Editorial</strong>" />;
```

```sh
pnpm exec cmx-bundle compile "pages/**/*.tsx" dist
pnpm exec cmx-document render dist --complete-only
```

The allowance defaults to `false`. Document Rendering checks evaluated intrinsic props, including spreads and intrinsic nodes in component slots, and rejects raw HTML with diagnostics. Framework-specific props, imported component data and metadata keep their application-defined meaning.

The Bundle carries this build setting. The resulting Document contains ordinary `innerHTML` data and no permission. This setting does not sanitize markup or grant the application's separate [UGC permission](../verify/README.md).
