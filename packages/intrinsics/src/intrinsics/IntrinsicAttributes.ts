import type { AriaAttributes } from "./AriaAttributes.js";
import type { CmxChildren } from "./CmxChildren.js";
import type { CmxStyle } from "./CmxStyle.js";

export interface IntrinsicAttributes extends AriaAttributes {
  children?: CmxChildren;
  key?: string | number;
  ref?: never;
  id?: string;
  class?: string;
  style?: string | CmxStyle;
  innerHTML?: string;
  lang?: string;
  dir?: "ltr" | "rtl" | "auto";
  role?: string;
  slot?: string;
  tabindex?: number | `${number}`;
  [attribute: `data-${string}`]: string | number | boolean | null | undefined;
  [event: `on${string}`]: never | undefined;
}
