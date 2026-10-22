import type { CmxConfig } from "@cmx-tools/contracts";
import { svgAssetLoader } from "./svgAssetLoader.js";

const config = {
  exports: {
    default: {
      required: true,
      type: {
        from: "@cmx-tools/contracts",
        import: "CmxNode",
      },
    },
    meta: {
      required: false,
      type: {
        from: "@example/backend-contract",
        import: "Meta",
      },
    },
  },
  externals: ["@example/backend-contract", "@example/ui-library"],
  assets: {
    loaders: { svg: svgAssetLoader },
  },
} satisfies CmxConfig;

export default config;
