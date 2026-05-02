import { readFile } from "node:fs/promises";
import path from "node:path";
import { rolldown } from "rolldown";
import {
  CMX_BUNDLE_FILE_NAME,
  parseCmxBundleJson,
  type CmxBundle,
} from "cmx-contracts";
import { cmx, type CmxPluginOptions } from "cmx-bundler";

export type CmxBundleInput = {
  entries: Record<string, string>;
  outDir: string;
  externals?: CmxPluginOptions["externals"];
  metaType?: CmxPluginOptions["metaType"];
  cwd?: string;
};

export async function cmxBundle(input: CmxBundleInput): Promise<CmxBundle> {
  const bundle = await rolldown({
    input: input.entries,
    plugins: [
      cmx({
        externals: input.externals,
        metaType: input.metaType,
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
