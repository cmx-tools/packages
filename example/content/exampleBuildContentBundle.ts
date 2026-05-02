import { exampleBuildCmxBundle } from "./exampleBuildCmxBundle.js";

export async function exampleBuildContentBundle(): Promise<void> {
  await exampleBuildCmxBundle({
    entries: {
      "404": "pages/404.tsx",
      about: "pages/about.tsx",
    },
    externals: ["@example/backend-contract", "@example/ui-library"],
    metaType: {
      from: "@example/backend-contract",
      import: "Meta",
      optional: true,
    },
    cwd: ".",
    outDir: "dist",
  });
}

await exampleBuildContentBundle();
