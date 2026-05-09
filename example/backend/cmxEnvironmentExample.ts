import { writeFile } from "node:fs/promises";
import { generateCmxEnvironment } from "cmx-environment";

export async function cmxEnvironmentExample(): Promise<void> {
  const result = await generateCmxEnvironment({
    cwd: process.cwd(),
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
    externals: [
      {
        contract: "@example/backend-contract",
        implementation: "./api.js",
      },
      "@example/ui-library",
    ],
  });

  await writeFile("_gen_cmx_environment.ts", result.source, "utf8");
}

await cmxEnvironmentExample();
