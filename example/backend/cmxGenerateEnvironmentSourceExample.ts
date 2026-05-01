import { writeFile } from "node:fs/promises";
import { cmxGenerateEnvironmentSource } from "cmx-bundler";

export async function cmxGenerateEnvironmentSourceExample(): Promise<void> {
  const { source } = cmxGenerateEnvironmentSource({
    entries: [
      { from: "./api.js", as: "@example/backend-contract" },
      { from: "@example/ui-library" },
    ],
    metaType: {
      from: "@example/backend-contract",
      import: "Meta",
    },
  });

  await writeFile("_gen_cmx_environment.ts", source, "utf8");
}

await cmxGenerateEnvironmentSourceExample();
