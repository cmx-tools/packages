import type { CmxUgcPolicy } from "@cmx-tools/verify";

export const reactUgcPolicy = Object.freeze({
  innerHtmlProps: Object.freeze(["dangerouslySetInnerHTML"]),
  disallowedProps: Object.freeze([
    "suppressContentEditableWarning",
    "suppressHydrationWarning",
  ]),
}) satisfies CmxUgcPolicy;
