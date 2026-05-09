import path from "node:path";
import { renderCmxDocuments } from "./renderCmxDocuments.js";

const VERSION = "0.1.0";

export async function runCmxDocumentCli(
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

  const result = await renderCmxDocuments({
    bundleDir: command.bundleDir,
  }).catch((error: unknown) => {
    process.stderr.write(formatCliError(error));
    return null;
  });

  if (result === null) {
    return 1;
  }

  if (result.result === "complete") {
    process.stdout.write(`${JSON.stringify(toDocumentMap(result.entries))}\n`);
    return 0;
  }

  if (result.result === "partial") {
    process.stdout.write(
      `${JSON.stringify(toDocumentMapFromMixedEntries(result.entries))}\n`,
    );
    writeDiagnostics(result.diagnostics);
    return 1;
  }

  writeDiagnostics(result.diagnostics);
  return 1;
}

type ParsedCommand = {
  bundleDir: string;
};

function parseCommand(argv: readonly string[]): ParsedCommand | null {
  const positionals = argv.filter((argument) => !argument.startsWith("-"));

  if (positionals[0] === "render") {
    if (positionals.length !== 2) {
      return null;
    }
    return {
      bundleDir: resolveBundleDir(positionals[1]),
    };
  }

  if (positionals.length === 1) {
    return {
      bundleDir: resolveBundleDir(positionals[0]),
    };
  }

  if (positionals.length >= 1) {
    return null;
  }

  return null;
}

function resolveBundleDir(bundleDir: string): string {
  return path.resolve(process.cwd(), bundleDir);
}

function writeUsage(): void {
  process.stderr.write(
    "Usage: cmx-document render <bundleDir>\nUsage: cmx-document <bundleDir>\n",
  );
}

function writeHelp(): void {
  process.stdout.write(
    [
      "cmx-document",
      "",
      "Usage:",
      "  cmx-document render <bundleDir>",
      "  cmx-document <bundleDir>",
      "",
      "Options:",
      "  --help",
      "  --version",
      "",
    ].join("\n"),
  );
}

function toDocumentMap(entries: Record<string, { document: unknown }>) {
  return Object.fromEntries(
    Object.entries(entries).map(([entryName, entry]) => [
      entryName,
      entry.document,
    ]),
  );
}

function toDocumentMapFromMixedEntries(
  entries: Record<
    string,
    { result: "document"; document: unknown } | { result: "error" }
  >,
): Record<string, unknown> {
  const documents: Record<string, unknown> = {};
  for (const [entryName, entry] of Object.entries(entries)) {
    if (entry.result !== "document") {
      continue;
    }
    documents[entryName] = entry.document;
  }
  return documents;
}

function writeDiagnostics(diagnostics: Array<{ message: string }>): void {
  for (const diagnostic of diagnostics) {
    process.stderr.write(`${diagnostic.message}\n`);
  }
}

function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n`;
  }
  return "Unknown error\n";
}
