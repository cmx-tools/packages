# @cmx-tools/markdown

Write prose with Markdown syntax inside CMX source. The helper produces CMX nodes.

```sh
pnpm add @cmx-tools/markdown
```

```tsx
import { md } from "@cmx-tools/markdown";

const label = "the guide";
const url = "/guide";

function Gallery() {
  return <aside>More content</aside>;
}

export default function Page() {
  return (
    <article>
      {md`
        # Hello

        Read [${label}](${url}).

        ${(<Gallery />)}
      `}
    </article>
  );
}
```

`md` emits native elements inside a CMX fragment. A standalone interpolation forms its own block. Inline interpolations remain children. Interpolated strings are literal values and never introduce Markdown syntax.

The helper removes surrounding blank lines and common indentation. Single source newlines become `br` elements. Blank lines separate paragraphs. Relative indentation remains meaningful for lists and code.

## Host components

Use `md({ from })` to route Markdown elements to component exports named after native tags:

```tsx
const prose = md({ from: "@my-app/prose" });
export default prose`# Hello`;
```

`from` names an installed contract package or its subpath. Declare the package in the content project's dependencies and configure it as a CMX external:

```ts
export default {
  externals: ["@my-app/prose"],
  exports: {
    default: {
      required: true,
      type: { from: "@cmx-tools/contracts", import: "CmxNode" },
    },
  },
};
```

The host can import the complete default map from its existing CMX framework adapter and override individual components:

```tsx
import { defaultCmxMarkdown } from "@cmx-tools/react";

const imports = {
  "@my-app/prose": {
    ...defaultCmxMarkdown,
    h1: MyHeading,
  },
};
```

The defaults are native tag strings. Remix hosts import the same map from `@cmx-tools/remix`. Interpolated components retain their original identity.

## Syntax

Paragraphs, headings, emphasis, strong emphasis, double-tilde strikethrough, links, images, inline code, fenced and indented code blocks, nested lists, blockquotes, thematic breaks and automatic links are supported. Links and images also support references. HTML source remains literal text. Tables, task checkboxes and footnotes have no special syntax.

Links provide `href` and optional `title`. Images provide `src`, `alt` and optional `title`. Ordered lists preserve their `start`. Fenced code becomes `pre` containing `code`, with `className="language-ts"` for a `ts` fence.

JavaScript template rules apply. Escape backticks for inline code, or use tilde fences for code blocks.

## Interpolation in props

A sole interpolation passes through directly. Mixed literal text and interpolations become a CMX fragment:

```tsx
md`[Profile](${url})`;
// <a href={url}>Profile</a>

md`[Profile](${base}/users/${id})`;
// <a href={<>{base}/users/{id}</>}>Profile</a>
```

The same rule applies to image descriptions and link or image titles. The helper introduces no value validation or coercion. Code interpolations remain children, as in JSX.
