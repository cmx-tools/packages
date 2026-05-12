import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { CmxConfig } from "@cmx-tools/contracts";
import { readPackageVersionFromImportMetaUrl } from "@cmx-tools/cli";
import { generateCmxEnvironment } from "../src/generateCmxEnvironment.js";

type CliModuleLoader = (specifier: string) => Promise<unknown>;
type RunCmxEnvironmentCliOptions = { importModule?: CliModuleLoader };

export async function runCmxEnvironmentCli(
  argv: readonly string[] = process.argv.slice(2),
  options: RunCmxEnvironmentCliOptions = {},
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    writeHelp();
    return 0;
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(
      `${readPackageVersionFromImportMetaUrl(import.meta.url)}\n`,
    );
    return 0;
  }

  const command = parseCommand(argv);
  if (command === null) {
    writeUsage();
    return 1;
  }

  try {
    const { resolveCmxCliConfig } = await loadCmxCli(
      options.importModule ?? ((specifier) => import(specifier)),
    );
    const config = await resolveCmxCliConfig({
      argv,
      cwd: command.cwd,
      env: process.env,
    });
    const result = await generateCmxEnvironment({
      cwd: command.cwd,
      ...config,
    });
    await mkdir(path.dirname(command.outFile), { recursive: true });
    await writeFile(command.outFile, result.source, "utf8");
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
  }) => Promise<CmxConfig>;
};

async function loadCmxCli(
  importModule: CliModuleLoader,
): Promise<CmxCliModule> {
  try {
    const module = (await importModule("@cmx-tools/cli")) as Record<
      string,
      unknown
    >;
    if (typeof module.resolveCmxCliConfig !== "function") {
      throw new Error("Invalid cmx-cli installation");
    }
    return module as CmxCliModule;
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        'Missing CLI dependency "@cmx-tools/cli". Install with: pnpm add -D @cmx-tools/cli @cmx-tools/environment',
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
  cwd: string;
  outFile: string;
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

  if (positionals[0] === "generate") {
    if (positionals.length !== 2) {
      return null;
    }
    return {
      cwd: resolveCliCwd(cwd),
      outFile: resolveOutputFile(positionals[1], cwd),
    };
  }

  if (positionals.length === 1) {
    return {
      cwd: resolveCliCwd(cwd),
      outFile: resolveOutputFile(positionals[0], cwd),
    };
  }

  if (positionals.length >= 1) {
    return null;
  }

  return null;
}

function resolveOutputFile(outFile: string, cliCwd?: string): string {
  return path.resolve(resolveCliCwd(cliCwd), outFile);
}

function resolveCliCwd(cliCwd?: string): string {
  return path.resolve(cliCwd ?? process.env.CMX_CWD ?? process.cwd());
}

function writeUsage(): void {
  process.stderr.write(
    "Usage: cmx-environment generate <outFile>\nUsage: cmx-environment <outFile>\n",
  );
}

function writeHelp(): void {
  process.stdout.write(
    [
      "@cmx-tools/environment",
      "",
      "Usage:",
      "  cmx-environment generate <outFile>",
      "  cmx-environment <outFile>",
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
