import path from "node:path";
import { resolveCmxCliConfig } from "cmx-cli-config";
import { compileCmxBundle } from "./compileCmxBundle.js";

const VERSION = "0.1.0";

export async function runCmxBundleCli(
  argv: readonly string[] = process.argv.slice(2),
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

type ParsedCommand = {
  cwd?: string;
  globPattern: string;
  outDir: string;
};

function parseCommand(argv: readonly string[]): ParsedCommand | null {
  const positionals: string[] = [];
  let cwd: string | undefined;

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
