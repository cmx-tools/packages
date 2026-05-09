import path from "node:path";
import { rolldown } from "rolldown";
import type { CmxContractConfig } from "cmx-contracts";
import fg from "fast-glob";
import { cmx } from "./cmx.js";

export type CompileCmxBundleOptions = {
  cwd: string;
  globPattern: string;
  outDir: string;
  config: CmxContractConfig;
};

export async function compileCmxBundle(
  options: CompileCmxBundleOptions,
): Promise<void> {
  const entryFiles = await fg(options.globPattern, {
    cwd: options.cwd,
    absolute: true,
    onlyFiles: true,
  });

  if (entryFiles.length === 0) {
    throw new Error(`No files matched glob: ${options.globPattern}`);
  }

  const entryMap = createEntryMap(entryFiles);
  const bundle = await rolldown({
    input: entryMap,
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

function createEntryMap(files: readonly string[]): Record<string, string> {
  const entryRoot = findSharedAncestor(files);
  const entryMap: Record<string, string> = {};

  for (const file of files) {
    const entryName = toEntryName(entryRoot, file);
    if (entryMap[entryName] !== undefined) {
      throw new Error(`Duplicate bundle entry name derived: ${entryName}`);
    }
    entryMap[entryName] = file;
  }

  return entryMap;
}

function findSharedAncestor(files: readonly string[]): string {
  const directories = files.map((file) => path.dirname(path.resolve(file)));
  let ancestor = directories[0] ?? process.cwd();

  for (const directory of directories.slice(1)) {
    while (!isParentDirectory(ancestor, directory)) {
      const parent = path.dirname(ancestor);
      if (parent === ancestor) {
        return ancestor;
      }
      ancestor = parent;
    }
  }

  return ancestor;
}

function isParentDirectory(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative === "" ||
    (!relative.startsWith("..") && !path.isAbsolute(relative))
  );
}

function toEntryName(root: string, file: string): string {
  const relativePath = path.relative(root, path.resolve(file));
  const extension = path.extname(relativePath);
  const withoutExtension =
    extension.length > 0
      ? relativePath.slice(0, relativePath.length - extension.length)
      : relativePath;
  return withoutExtension.split(path.sep).join("/");
}
