import type { CmxUgcPolicy } from "@cmx-tools/verify";

export const reactUgcPolicy = Object.freeze({
  disallowedProps: Object.freeze([
    "dangerouslySetInnerHTML",
    "suppressContentEditableWarning",
    "suppressHydrationWarning",
  ]),
}) satisfies CmxUgcPolicy;
