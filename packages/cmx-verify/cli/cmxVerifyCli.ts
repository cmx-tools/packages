import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  CmxConfig,
  CmxDiagnostic,
  CmxDocument,
  CmxVerifyDocument,
} from "cmx-contracts";
import { readPackageVersionFromImportMetaUrl } from "cmx-cli";
import { validateCmxDocument } from "../src/validateCmxDocument.js";

type CliModuleLoader = (specifier: string) => Promise<unknown>;
type RunCmxVerifyCliOptions = {
  importModule?: CliModuleLoader;
  readStdin?: () => Promise<string>;
};

type CmxCliModule = {
  resolveCmxCliConfig: (options: {
    argv?: readonly string[];
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }) => Promise<CmxConfig>;
};

type ParsedCommand = {
  input: string;
  cwd: string;
};

type DocumentInput =
  | {
      kind: "document";
      document: CmxDocument;
    }
  | {
      kind: "entry-map";
      entries: Record<string, CmxDocument>;
    };

export async function runCmxVerifyCli(
  argv: readonly string[] = process.argv.slice(2),
  options: RunCmxVerifyCliOptions = {},
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

    const rawInput = await readInputJson({
      inputPath: command.input,
      cwd: config.cwd ?? command.cwd,
      readStdin: options.readStdin,
    });

    const input = parseDocumentInput(rawInput);
    if (input === null) {
      writeDiagnostics([
        {
          severity: "error",
          code: "invalid-document-input",
          message:
            "Input must be one rendered CMX document or an entry map of rendered CMX documents",
        },
      ]);
      return 1;
    }

    const result = await validateInput(input, config.verifyDocument);
    if (result.result === "invalid") {
      writeDiagnostics(result.diagnostics);
      return 1;
    }

    process.stdout.write(`${JSON.stringify(result.output)}\n`);
    return 0;
  } catch (error) {
    process.stderr.write(formatCliError(error));
    return 1;
  }
}

function parseCommand(argv: readonly string[]): ParsedCommand | null {
  const positionals: string[] = [];
  let cwd = process.cwd();

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
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        return null;
      }
      cwd = path.resolve(value);
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

  if (positionals[0] === "validate") {
    const input = positionals[1];
    if (positionals.length !== 2 || input === undefined) {
      return null;
    }
    return { input, cwd };
  }

  if (positionals.length === 1) {
    return { input: positionals[0], cwd };
  }

  return null;
}

function parseDocumentInput(input: unknown): DocumentInput | null {
  if (isCmxDocument(input)) {
    return {
      kind: "document",
      document: input,
    };
  }

  if (!isRecord(input)) {
    return null;
  }

  const entries = Object.entries(input);
  if (entries.length === 0) {
    return null;
  }

  const documents: Record<string, CmxDocument> = {};
  for (const [entryName, value] of entries) {
    if (!isCmxDocument(value)) {
      return null;
    }
    documents[entryName] = value;
  }

  return {
    kind: "entry-map",
    entries: documents,
  };
}

async function validateInput(
  input: DocumentInput,
  verifyDocument: CmxVerifyDocument | undefined,
): Promise<
  | {
      result: "valid";
      output: CmxDocument | Record<string, CmxDocument>;
    }
  | {
      result: "invalid";
      diagnostics: CmxDiagnostic[];
    }
> {
  if (input.kind === "document") {
    const validation = await validateCmxDocument({
      document: input.document,
      verifyDocument,
    });
    if (validation.result === "invalid") {
      return validation;
    }

    return {
      result: "valid",
      output: validation.document,
    };
  }

  const output: Record<string, CmxDocument> = {};
  for (const [entryName, document] of Object.entries(input.entries)) {
    const validation = await validateCmxDocument({
      document,
      verifyDocument,
    });
    if (validation.result === "invalid") {
      return {
        result: "invalid",
        diagnostics: validation.diagnostics,
      };
    }
    output[entryName] = validation.document;
  }

  return {
    result: "valid",
    output,
  };
}

type ReadInputJsonInput = {
  inputPath: string;
  cwd: string;
  readStdin?: () => Promise<string>;
};

async function readInputJson(input: ReadInputJsonInput): Promise<unknown> {
  const rawInput =
    input.inputPath === "-"
      ? await (input.readStdin ?? defaultReadStdin)()
      : await readFile(path.resolve(input.cwd, input.inputPath), "utf8");
  return JSON.parse(rawInput);
}

async function defaultReadStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function isCmxDocument(value: unknown): value is CmxDocument {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.$schema ===
      "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json" &&
    typeof value.cmxVersion === "number" &&
    isRecord(value.interface) &&
    isRecord(value.content)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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
        'Missing CLI dependency "cmx-cli". Install with: pnpm add -D cmx-cli cmx-verify',
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

function writeUsage(): void {
  process.stderr.write(
    "Usage: cmx-verify validate <input>\nUsage: cmx-verify <input>\n",
  );
}

function writeHelp(): void {
  process.stdout.write(
    [
      "cmx-verify",
      "",
      "Usage:",
      "  cmx-verify validate <input>",
      "  cmx-verify <input>",
      "",
      "Input:",
      "  <input> file path or - for stdin",
      "",
      "Options:",
      "  --cwd <path>",
      "  --config <path>",
      "  --help",
      "  --version",
      "",
    ].join("\n"),
  );
}

function writeDiagnostics(diagnostics: CmxDiagnostic[]): void {
  for (const diagnostic of diagnostics) {
    process.stderr.write(`${diagnostic.code}: ${diagnostic.message}\n`);
  }
}

function formatCliError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.message}\n`;
  }

  return "Unknown error\n";
}
