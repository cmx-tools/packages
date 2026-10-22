import path from "node:path";
import type * as CliModule from "@cmx-tools/cli";
import { createCmxAssetPipeline } from "../src/index.js";
import { watchCmxAssets } from "./watchCmxAssets.js";

type CliModuleLoader = (specifier: string) => Promise<unknown>;
type RunCmxAssetsCliOptions = { importModule?: CliModuleLoader };

export async function runCmxAssetsCli(
  argv: readonly string[] = process.argv.slice(2),
  options: RunCmxAssetsCliOptions = {},
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(
      "Usage: cmx-assets prepare <glob> [--watch] [--cwd <path>] [--config <path>]\n",
    );
    return 0;
  }
  try {
    const cli = await loadCmxCli(
      options.importModule ?? ((specifier) => import(specifier)),
    );
    if (argv.includes("--version") || argv.includes("-v")) {
      process.stdout.write(
        `${cli.readPackageVersionFromImportMetaUrl(import.meta.url)}\n`,
      );
      return 0;
    }
    const command = parseCommand(argv);
    if (!command)
      throw new Error(
        "Usage: cmx-assets prepare <glob> [--watch] [--cwd <path>] [--config <path>]",
      );
    const prepare = async () => {
      const config = await cli.resolveCmxCliConfig({ argv });
      if (!config.assets)
        throw new Error(
          "Configure assets in cmx.config.ts before preparing Asset imports.",
        );
      if (!config.configPath)
        throw new Error(
          "Asset import types require a TypeScript or JavaScript CMX config file.",
        );
      const entries = await cli.glob(command.globPattern, { cwd: config.cwd });
      if (entries.length === 0)
        throw new Error(
          `No files matched glob ${JSON.stringify(command.globPattern)}`,
        );
      await createCmxAssetPipeline({
        cwd: config.cwd,
        assets: config.assets,
      }).prepare({ entries, configPath: config.configPath });
      return config;
    };
    const config = await prepare();
    if (command.watch) {
      const watching = watchCmxAssets({
        cwd: path.resolve(config.cwd),
        configPath: config.configPath!,
        cacheDir: path.resolve(
          config.cwd,
          config.assets!.cacheDir ?? ".cmx/assets",
        ),
        prepare,
      });
      process.stdout.write("Watching Asset imports.\n");
      await watching;
    }
    return 0;
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Unknown error"}\n`,
    );
    return 1;
  }
}

async function loadCmxCli(
  importModule: CliModuleLoader,
): Promise<typeof CliModule> {
  try {
    return (await importModule("@cmx-tools/cli")) as typeof CliModule;
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ERR_MODULE_NOT_FOUND"
    ) {
      throw new Error('Missing CLI dependency "@cmx-tools/cli".');
    }
    throw error;
  }
}

function parseCommand(
  argv: readonly string[],
): { globPattern: string; watch: boolean } | undefined {
  const positionals: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--watch") continue;
    if (argument === "--cwd" || argument === "--config") {
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) return undefined;
    positionals.push(argument);
  }
  if (positionals[0] === "prepare") positionals.shift();
  if (positionals.length !== 1) return undefined;
  return { globPattern: positionals[0], watch: argv.includes("--watch") };
}
