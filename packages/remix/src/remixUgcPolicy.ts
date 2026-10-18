import type { CmxUgcPolicy } from "@cmx-tools/verify";

export const remixUgcPolicy = Object.freeze({
  disallowedProps: Object.freeze([
    "mix",
    "data-rmx-document",
    "data-rmx-history",
    "data-rmx-key",
    "data-rmx-import-map",
    "data-rmx-module-preload",
    "data-rmx-preserve-attrs",
    "data-rmx-preserve-dom",
    "data-rmx-reset-scroll",
    "data-rmx-src",
    "data-rmx-style",
    "data-rmx-target",
  ]),
}) satisfies CmxUgcPolicy;
