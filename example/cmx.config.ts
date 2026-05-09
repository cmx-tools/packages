import type { CmxContractConfig } from "cmx-contracts";

const config: CmxContractConfig = {
  exports: {
    default: {
      required: true,
      type: {
        from: "cmx-contracts",
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
};

export default config;
