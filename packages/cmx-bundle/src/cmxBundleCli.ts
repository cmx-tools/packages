import path from "node:path";
import type { CmxContractConfig } from "cmx-contracts";
import { compileCmxBundle } from "./compileCmxBundle.js";

const VERSION = "0.1.0";
type CliModuleLoader = (specifier: string) => Promise<unknown>;
type RunCmxBundleCliOptions = { importModule?: CliModuleLoader };

export async function runCmxBundleCli(
  argv: readonly string[] = process.argv.slice(2),
  options: RunCmxBundleCliOptions = {},
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    writeHelp();
    return 0;
  }
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const command = parseCommand(argv);
  if (command === null) {
    process.stderr.write(
      "Usage: cmx-bundle compile <glob> <outDir>\nUsage: cmx-bundle <glob> <outDir>\n",
    );
    return 1;
  }

  try {
    const cwd = command.cwd ?? process.cwd();
    const { resolveCmxCliConfig } = await loadCmxCli(
      options.importModule ?? ((specifier) => import(specifier)),
    );
    const config = await resolveCmxCliConfig({ argv, cwd, env: process.env });
    await compileCmxBundle({
      cwd,
      globPattern: command.globPattern,
      outDir: command.outDir,
      config,
    });
    return 0;
  } catch (error) {
    process.stderr.write(formatCliError(error));
    return 1;
  }
}

type CmxCliModule = {
  resolveCmxCliConfig: (options: {
    argv?: readonly string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<CmxContractConfig>;
};

async function loadCmxCli(
  importModule: CliModuleLoader,
): Promise<CmxCliModule> {
  try {
    const module = (await importModule("cmx-cli")) as Record<string, unknown>;
    if (typeof module.resolveCmxCliConfig !== "function") {
      throw new Error("Invalid cmx-cli installation");
    }
    return module as CmxCliModule;
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        'Missing CLI dependency "cmx-cli". Install with: pnpm add -D cmx-cli cmx-bundle',
      );
    }
    throw error;
  }
}

function isMissingModuleError(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ERR_MODULE_NOT_FOUND"
  );
}

type ParsedCommand = {
  cwd?: string;
  globPattern: string;
  outDir: string;
};

function parseCommand(argv: readonly string[]): ParsedCommand | null {
  const positionals: string[] = [];
  let cwd: string | undefined;
  const valueFlags = new Set([
    "--cwd",
    "--config",
    "--external",
    "--exports",
    "--externals",
  ]);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cwd") {
      const cwdValue = argv[index + 1];
      if (cwdValue === undefined || cwdValue.startsWith("--")) {
        return null;
      }
      cwd = cwdValue;
      index += 1;
      continue;
    }
    if (argument.startsWith("--")) {
      const next = argv[index + 1];
      const hasInlineValue = argument.includes("=");
      const expectsValue = valueFlags.has(argument) || argument.includes(".");
      if (
        !hasInlineValue &&
        expectsValue &&
        next !== undefined &&
        !next.startsWith("-")
      ) {
        index += 1;
      }
      continue;
    }
    positionals.push(argument);
  }

  if (positionals[0] === "compile") {
    if (positionals.length !== 3) {
      return null;
    }
    return {
      cwd: resolveCliCwd(cwd),
      globPattern: positionals[1],
      outDir: positionals[2],
    };
  }

  if (positionals.length === 2) {
    return {
      cwd: resolveCliCwd(cwd),
      globPattern: positionals[0],
      outDir: positionals[1],
    };
  }

  if (positionals.length >= 1) {
    return null;
  }

  return null;
}

function resolveCliCwd(cliCwd?: string): string {
  return path.resolve(cliCwd ?? process.env.CMX_CWD ?? process.cwd());
}

function writeHelp(): void {
  process.stdout.write(
    [
      "cmx-bundle",
      "",
      "Usage:",
      "  cmx-bundle compile <glob> <outDir>",
      "  cmx-bundle <glob> <outDir>",
      "",
      "Options:",
      "  --cwd <path>",
      "  --config <path>",
      "  --external <entry>",
      "  --exports <json>",
      "  --externals <json>",
      "  --help",
      "  --version",
      "",
    ].join("\n"),
  );
}

function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n`;
  }
  return "Unknown error\n";
}
