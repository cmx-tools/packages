import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveCmxCliConfig } from "cmx-cli-config";
import { generateCmxEnvironment } from "./generateCmxEnvironment.js";

const VERSION = "0.1.0";

export async function runCmxEnvironmentCli(
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
    writeUsage();
    return 1;
  }

  try {
    const config = await resolveCmxCliConfig({
      argv,
      cwd: command.cwd,
      env: process.env,
    });
    const result = await generateCmxEnvironment({
      cwd: command.cwd,
      exports: config.exports ?? {},
      externals: config.externals,
    });
    await mkdir(path.dirname(command.outFile), { recursive: true });
    await writeFile(command.outFile, result.source, "utf8");
    return 0;
  } catch (error) {
    process.stderr.write(formatCliError(error));
    return 1;
  }
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
      if (
        valueFlags.has(argument) &&
        argv[index + 1] !== undefined &&
        !argv[index + 1].startsWith("--")
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
      "cmx-environment",
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
