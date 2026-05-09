const VERSION = "0.1.0";

const CAPABILITY_RUNNERS = {
  bundle: {
    entrypoint: "cmx-bundle/cli",
    exportName: "runCmxBundleCli",
    packageName: "cmx-bundle",
  },
  document: {
    entrypoint: "cmx-document/cli",
    exportName: "runCmxDocumentCli",
    packageName: "cmx-document",
  },
  environment: {
    entrypoint: "cmx-environment/cli",
    exportName: "runCmxEnvironmentCli",
    packageName: "cmx-environment",
  },
} as const;

type CapabilityName = keyof typeof CAPABILITY_RUNNERS;

type CapabilityRunner = (argv: readonly string[]) => Promise<number>;
type CliModuleLoader = (specifier: string) => Promise<unknown>;

export type RunCmxCliOptions = {
  importModule?: CliModuleLoader;
};

export async function runCmxCli(
  argv: readonly string[] = process.argv.slice(2),
  options: RunCmxCliOptions = {},
): Promise<number> {
  if (argv.includes("--help") || argv.includes("-h")) {
    writeHelp();
    return 0;
  }

  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${VERSION}\n`);
    return 0;
  }

  const verb = argv[0] as CapabilityName | undefined;
  if (verb === undefined || !(verb in CAPABILITY_RUNNERS)) {
    writeUsage();
    return 1;
  }

  try {
    const runCapabilityCli = await loadCapabilityRunner(
      verb,
      options.importModule ?? ((specifier) => import(specifier)),
    );
    return await runCapabilityCli(argv.slice(1));
  } catch (error) {
    process.stderr.write(formatCliError(error));
    return 1;
  }
}

async function loadCapabilityRunner(
  capability: CapabilityName,
  importModule: CliModuleLoader,
): Promise<CapabilityRunner> {
  const entry = CAPABILITY_RUNNERS[capability];
  try {
    const module = (await importModule(entry.entrypoint)) as Record<
      string,
      unknown
    >;
    const runner = module[entry.exportName];
    if (typeof runner !== "function") {
      throw new Error(
        `CMX CLI missing ${entry.exportName} export in ${entry.entrypoint}`,
      );
    }
    return runner as CapabilityRunner;
  } catch (error) {
    if (isMissingModuleError(error)) {
      throw new Error(
        `Missing capability package ${JSON.stringify(entry.packageName)}. Install with: pnpm add -D cmx-cli ${entry.packageName}`,
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
  process.stderr.write("Usage: cmx <bundle|document|environment> [...args]\n");
}

function writeHelp(): void {
  process.stdout.write(
    [
      "cmx",
      "",
      "Usage:",
      "  cmx <bundle|document|environment> [...args]",
      "",
      "Examples:",
      '  cmx bundle compile "pages/**/*.tsx" dist',
      "  cmx document render dist --out-dir documents",
      "  cmx environment generate dist/cmx-environment.ts",
      "",
      "Options:",
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
