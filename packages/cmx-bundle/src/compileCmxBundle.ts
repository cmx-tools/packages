import path from "node:path";
import { rolldown } from "rolldown";
import type { CmxConfig } from "cmx-contracts";
import { cmx } from "./cmx.js";

export type CompileCmxBundleOptions = {
  cwd: string;
  entries: Record<string, string>;
  outDir: string;
  config: CmxConfig;
};

export async function compileCmxBundle(
  options: CompileCmxBundleOptions,
): Promise<void> {
  const bundle = await rolldown({
    input: options.entries,
    cwd: options.cwd,
    plugins: [
      cmx({
        cwd: options.cwd,
        exports: options.config.exports ?? {},
        externals: options.config.externals,
        unsupportedValues: options.config.unsupportedValues,
        unverifiedOptionalExports: options.config.unverifiedOptionalExports,
      }),
    ],
  });

  try {
    await bundle.write({
      dir: path.resolve(options.cwd, options.outDir),
      entryFileNames: "[name].js",
      chunkFileNames: "[name]-[hash].js",
    });
  } finally {
    await bundle.close();
  }
}
