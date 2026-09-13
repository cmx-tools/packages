import type { CmxIntrinsics } from "@cmx-tools/intrinsics";

declare module "@cmx-tools/intrinsics" {
  interface CmxIntrinsics {
    "product-card": CmxIntrinsics["div"] & {
      sku: string;
      currency?: "EUR" | "USD";
    };
  }
}

export const card = (
  <product-card sku="coffee" currency="EUR" class="featured" data-roast="dark">
    <strong>Freshly roasted</strong>
  </product-card>
);

// @ts-expect-error Custom elements retain their required prop contract.
export const missingSku = <product-card />;
// @ts-expect-error Misspelled custom props are rejected.
export const wrongProp = <product-card sku="coffee" curency="EUR" />;
// @ts-expect-error Custom tag names must be explicitly declared.
export const unknownTag = <coffee-card />;
const interactive = { onClick: () => undefined };
// @ts-expect-error Custom elements are still static intrinsic nodes.
export const callback = <product-card sku="coffee" {...interactive} />;
