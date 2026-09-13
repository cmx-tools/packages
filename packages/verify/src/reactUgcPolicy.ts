import type { CmxUgcPolicy } from "./index.js";

export const reactUgcPolicy: CmxUgcPolicy = Object.freeze({
  disallowedProps: Object.freeze([
    "className",
    "dangerouslySetInnerHTML",
    "suppressContentEditableWarning",
    "suppressHydrationWarning",
  ]),
});
