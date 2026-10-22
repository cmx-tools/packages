import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { assertCmxAssetTypeSource } from "./assertCmxAssetTypeSource.js";

export type PrepareCmxAssetImportsOptions = {
  entries: readonly string[] | Record<string, string>;
  configPath: string;
};

export async function prepareCmxAssetImports(
  cwd: string,
  options: PrepareCmxAssetImportsOptions,
  loaderFor: (filename: string) => readonly [string, unknown] | undefined,
  prepareAsset: (filename: string) => Promise<unknown>,
): Promise<string[]> {
  const visited = new Set<string>();
  const generated: string[] = [];
  const tsconfigPath = ts.findConfigFile(cwd, ts.sys.fileExists);
  const compilerOptions = tsconfigPath
    ? ts.parseJsonConfigFileContent(
        ts.readConfigFile(tsconfigPath, ts.sys.readFile).config,
        ts.sys,
        path.dirname(tsconfigPath),
      ).options
    : { moduleResolution: ts.ModuleResolutionKind.NodeNext };
  function assetForDeclaration(filename: string): string | undefined {
    const original = filename.replace(/\.d(\.[^./\\]+)\.ts$/, "$1");
    return original !== filename &&
      loaderFor(original) &&
      ts.sys.fileExists(original)
      ? original
      : undefined;
  }
  const resolutionHost: ts.ModuleResolutionHost = {
    ...ts.sys,
    fileExists(filename) {
      return (
        ts.sys.fileExists(filename) ||
        assetForDeclaration(filename) !== undefined
      );
    },
  };
  let assertTypeSource: ((identity: string) => void) | undefined;
  async function visit(filename: string) {
    if (visited.has(filename)) return;
    visited.add(filename);
    const loader = loaderFor(filename);
    if (loader) {
      assertTypeSource ??= assertCmxAssetTypeSource(
        path.resolve(cwd, options.configPath),
        compilerOptions,
      );
      assertTypeSource(loader[0]);
      await prepareAsset(filename);
      const extension = path.extname(filename);
      const declaration =
        filename.slice(0, -extension.length) + `.d${extension}.ts`;
      let configImport = path
        .relative(
          path.dirname(declaration),
          path.resolve(cwd, options.configPath),
        )
        .split(path.sep)
        .join("/");
      if (!configImport.startsWith(".")) configImport = `./${configImport}`;
      configImport = configImport.replace(
        /\.(?:ts|tsx|mts|cts)$/,
        (extension) =>
          extension === ".mts" ? ".mjs" : extension === ".cts" ? ".cjs" : ".js",
      );
      const source = `type Loader = typeof import(${JSON.stringify(configImport)}).default.assets.loaders[${JSON.stringify(loader[0])}];\ndeclare const asset: Awaited<ReturnType<Loader["load"]>>;\nexport default asset;\n`;
      const existing = await readFile(declaration, "utf8").catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== "ENOENT") throw error;
          return undefined;
        },
      );
      if (existing !== source) await writeFile(declaration, source);
      generated.push(declaration);
      return;
    }
    const source = await readFile(filename, "utf8");
    const imports = ts.preProcessFile(source, true, true).importedFiles;
    for (const imported of imports) {
      const direct = path.resolve(path.dirname(filename), imported.fileName);
      if (imported.fileName.startsWith(".") && loaderFor(direct)) {
        await visit(direct);
        continue;
      }
      const resolved = ts.resolveModuleName(
        imported.fileName,
        filename,
        compilerOptions,
        resolutionHost,
      ).resolvedModule;
      const resolvedAsset =
        resolved && assetForDeclaration(resolved.resolvedFileName);
      if (resolvedAsset) {
        await visit(resolvedAsset);
        continue;
      }
      if (
        resolved &&
        !resolved.isExternalLibraryImport &&
        !resolved.resolvedFileName.endsWith(".d.ts")
      )
        await visit(resolved.resolvedFileName);
    }
  }
  await Promise.all(
    Object.values(options.entries).map((entry) =>
      visit(path.resolve(cwd, entry)),
    ),
  );
  return generated;
}
