import { readFile } from "node:fs/promises";
import path from "node:path";
import { rolldown } from "rolldown";
import {
  CMX_BUNDLE_FILE_NAME,
  parseCmxBundleJson,
  type CmxBundle,
} from "cmx-contracts";
import { cmx, type CmxPluginOptions } from "cmx-bundle";

export type ExampleBuildCmxBundleInput = {
  entries: Record<string, string>;
  outDir: string;
  externals?: CmxPluginOptions["externals"];
  exports: CmxPluginOptions["exports"];
  cwd?: string;
};

export async function exampleBuildCmxBundle(
  input: ExampleBuildCmxBundleInput,
): Promise<CmxBundle> {
  const bundle = await rolldown({
    input: input.entries,
    plugins: [
      cmx({
        externals: input.externals,
        exports: input.exports,
        cwd: input.cwd,
      }),
    ],
  });

  try {
    await bundle.write({
      dir: input.outDir,
      entryFileNames: "[name].js",
      chunkFileNames: "[name]-[hash].js",
    });
  } finally {
    await bundle.close();
  }

  return parseCmxBundleJson(
    await readFile(path.join(input.outDir, CMX_BUNDLE_FILE_NAME), "utf8"),
  );
}
