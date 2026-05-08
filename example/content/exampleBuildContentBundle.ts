import { exampleBuildCmxBundle } from "./exampleBuildCmxBundle.js";

export async function exampleBuildContentBundle(): Promise<void> {
  await exampleBuildCmxBundle({
    entries: {
      "404": "pages/404.tsx",
      about: "pages/about.tsx",
    },
    externals: ["@example/backend-contract", "@example/ui-library"],
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
    cwd: ".",
    outDir: "dist",
  });
}

await exampleBuildContentBundle();
