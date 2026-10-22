import type { CmxConfig } from "@cmx-tools/contracts";
import { createLocalAssetStorage } from "@cmx-tools/assets";
import { fileURLToPath } from "node:url";
import { svgAssetProcessor } from "./svgAssetProcessor.js";

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
    processors: { svg: svgAssetProcessor },
    storage: createLocalAssetStorage({
      directory: fileURLToPath(
        new URL("./content/.cmx/assets/files", import.meta.url),
      ),
      publicBaseUrl: "/_assets",
    }),
  },
} satisfies CmxConfig;

export default config;
