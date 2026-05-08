import { unlink } from "node:fs/promises";
import { rolldown } from "rolldown";
import { cmx } from "cmx-bundler";

const ENV_ONLY_ENTRY = "virtual:cmx-env-only-entry";
const ENV_ONLY_ARTIFACTS = [
  ".cmx-env-only.js",
  ".cmx-env-only.js.map",
  "cmx-bundle.json",
] as const;

export async function cmxEnvironmentExample(): Promise<void> {
  const bundle = await rolldown({
    input: ENV_ONLY_ENTRY,
    plugins: [
      {
        name: "cmx-env-only-entry",
        resolveId(source) {
          if (source === ENV_ONLY_ENTRY) {
            return source;
          }
        },
        load(id) {
          if (id === ENV_ONLY_ENTRY) {
            return "export const meta = {};\nexport default {};\n";
          }
        },
      },
      cmx({
        cwd: process.cwd(),
        exports: {
          default: {
            required: true,
            type: {
              from: "cmx-contracts",
              import: "CmxNode",
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
        environment: {
          fileName: "_gen_cmx_environment.ts",
        },
      }),
    ],
  });

  try {
    await bundle.write({
      dir: ".",
      entryFileNames: ".cmx-env-only.js",
    });
  } finally {
    await bundle.close();
  }

  await Promise.all(
    ENV_ONLY_ARTIFACTS.map(async (artifact) => {
      await unlink(artifact).catch((error: unknown) => {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "ENOENT"
        ) {
          throw error;
        }
      });
    }),
  );
}

await cmxEnvironmentExample();
