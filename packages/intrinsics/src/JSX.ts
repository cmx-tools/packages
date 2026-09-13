import type { CmxChildren, CmxIntrinsics } from "./intrinsics/index.js";

export namespace JSX {
  export type Element = CmxChildren;
  export type ElementType =
    | keyof IntrinsicElements
    | ((props: any) => CmxChildren);
  export interface ElementChildrenAttribute {
    children: unknown;
  }
  export interface IntrinsicElements extends CmxIntrinsics {}
  export interface IntrinsicAttributes {
    key?: string | number;
  }
}
