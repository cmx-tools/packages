import type { CmxUgcPolicy } from "@cmx-tools/verify";

export const reactUgcPolicy = Object.freeze({
  disallowedProps: Object.freeze([
    "className",
    "dangerouslySetInnerHTML",
    "suppressContentEditableWarning",
    "suppressHydrationWarning",
  ]),
}) satisfies CmxUgcPolicy;
