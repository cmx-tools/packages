import type { HtmlIntrinsics } from "./HtmlIntrinsics.js";
import type { SvgIntrinsics } from "./SvgIntrinsics.js";

type BuiltinIntrinsics = {
  [Tag in
    | keyof HtmlIntrinsics
    | keyof SvgIntrinsics]: Tag extends keyof HtmlIntrinsics
    ? Tag extends keyof SvgIntrinsics
      ? HtmlIntrinsics[Tag] & SvgIntrinsics[Tag]
      : HtmlIntrinsics[Tag]
    : Tag extends keyof SvgIntrinsics
      ? SvgIntrinsics[Tag]
      : never;
};

export interface CmxIntrinsics extends BuiltinIntrinsics {}
