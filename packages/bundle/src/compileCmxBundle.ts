import path from "node:path";
import { rolldown } from "rolldown";
import type { CmxConfig } from "@cmx-tools/contracts";
import { cmx } from "./cmx.js";

export type CompileCmxBundleOptions = CmxConfig & {
  entries: Record<string, string>;
  outDir: string;
};

export async function compileCmxBundle(
  options: CompileCmxBundleOptions,
): Promise<void> {
  const cwd = path.resolve(options.cwd ?? process.cwd());
  const bundle = await rolldown({
    input: options.entries,
    cwd,
    plugins: [cmx({ ...options, cwd })],
  });

  try {
    await bundle.write({
      dir: path.resolve(cwd, options.outDir),
      entryFileNames: "[name].js",
      chunkFileNames: "[name]-[hash].js",
    });
  } finally {
    await bundle.close();
  }
}
