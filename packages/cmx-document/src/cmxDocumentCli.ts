import { mkdir, writeFile } from "node:fs/promises";
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
    const documents = toDocumentMap(result.entries);
    if (command.outDir === null) {
      process.stdout.write(`${JSON.stringify(documents)}\n`);
    } else {
      if (!(await writeDocumentsOrFail(command.outDir, documents))) {
        return 1;
      }
    }
    return 0;
  }

  if (result.result === "partial") {
    const documents = toDocumentMapFromMixedEntries(result.entries);
    if (command.outDir === null) {
      process.stdout.write(`${JSON.stringify(documents)}\n`);
    } else {
      if (!(await writeDocumentsOrFail(command.outDir, documents))) {
        return 1;
      }
    }
    writeDiagnostics(result.diagnostics);
    return 1;
  }

  writeDiagnostics(result.diagnostics);
  return 1;
}

type ParsedCommand = {
  bundleDir: string;
  outDir: string | null;
};

function parseCommand(argv: readonly string[]): ParsedCommand | null {
  const options = parseOptions(argv);
  if (options === null) {
    return null;
  }

  if (options.positionals[0] === "render") {
    if (options.positionals.length !== 2) {
      return null;
    }
    return {
      bundleDir: resolveBundleDir(options.positionals[1]),
      outDir: resolveOutDir(options.outDir),
    };
  }

  if (options.positionals.length === 1) {
    return {
      bundleDir: resolveBundleDir(options.positionals[0]),
      outDir: resolveOutDir(options.outDir),
    };
  }

  if (options.positionals.length >= 1) {
    return null;
  }

  return null;
}

type ParsedOptions = {
  positionals: string[];
  outDir: string | null;
};

function parseOptions(argv: readonly string[]): ParsedOptions | null {
  const positionals: string[] = [];
  let outDir: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--out-dir") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("-")) {
        return null;
      }
      outDir = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      continue;
    }
    positionals.push(argument);
  }

  return {
    positionals,
    outDir,
  };
}

function resolveBundleDir(bundleDir: string): string {
  return path.resolve(process.cwd(), bundleDir);
}

function resolveOutDir(outDir: string | null): string | null {
  if (outDir === null) {
    return null;
  }
  return path.resolve(process.cwd(), outDir);
}

function writeUsage(): void {
  process.stderr.write(
    "Usage: cmx-document render <bundleDir> [--out-dir <dir>]\nUsage: cmx-document <bundleDir> [--out-dir <dir>]\n",
  );
}

function writeHelp(): void {
  process.stdout.write(
    [
      "cmx-document",
      "",
      "Usage:",
      "  cmx-document render <bundleDir> [--out-dir <dir>]",
      "  cmx-document <bundleDir> [--out-dir <dir>]",
      "",
      "Options:",
      "  --out-dir <dir>",
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

async function writeDocuments(
  outDir: string,
  documents: Record<string, unknown>,
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  for (const [entryName, document] of Object.entries(documents)) {
    const documentPath = resolveOutputDocumentPath(outDir, entryName);
    await mkdir(path.dirname(documentPath), { recursive: true });
    await writeFile(documentPath, `${JSON.stringify(document)}\n`, "utf8");
  }
}

async function writeDocumentsOrFail(
  outDir: string,
  documents: Record<string, unknown>,
): Promise<boolean> {
  try {
    await writeDocuments(outDir, documents);
    return true;
  } catch (error) {
    process.stderr.write(formatCliError(error));
    return false;
  }
}

function resolveOutputDocumentPath(outDir: string, entryName: string): string {
  const documentPath = path.resolve(outDir, `${entryName}.json`);
  const relativePath = path.relative(path.resolve(outDir), documentPath);
  if (
    relativePath === "" ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error(
      `Invalid bundle entry name for --out-dir output: "${entryName}"`,
    );
  }
  return documentPath;
}
