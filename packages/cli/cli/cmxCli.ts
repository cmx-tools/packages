import { readPackageVersionFromImportMetaUrl } from "../src/readPackageVersionFromImportMetaUrl.js";

const CAPABILITY_RUNNERS = {
  assets: {
    entrypoint: "@cmx-tools/assets/cli",
    exportName: "runCmxAssetsCli",
    packageName: "@cmx-tools/assets",
  },
  bundle: {
    entrypoint: "@cmx-tools/bundle/cli",
    exportName: "runCmxBundleCli",
    packageName: "@cmx-tools/bundle",
  },
  document: {
    entrypoint: "@cmx-tools/document/cli",
    exportName: "runCmxDocumentCli",
    packageName: "@cmx-tools/document",
  },
  environment: {
    entrypoint: "@cmx-tools/environment/cli",
    exportName: "runCmxEnvironmentCli",
    packageName: "@cmx-tools/environment",
  },
  verify: {
    entrypoint: "@cmx-tools/verify/cli",
    exportName: "runCmxVerifyCli",
    packageName: "@cmx-tools/verify",
  },
  publish: {
    entrypoint: "@cmx-tools/publish/cli",
    exportName: "runCmxPublishCli",
    packageName: "@cmx-tools/publish",
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
  const [firstArg, ...restArgs] = argv;

  if (firstArg === "--help" || firstArg === "-h") {
    writeHelp();
    return 0;
  }

  if (firstArg === "--version" || firstArg === "-v") {
    process.stdout.write(
      `${readPackageVersionFromImportMetaUrl(import.meta.url)}\n`,
    );
    return 0;
  }

  const verb = firstArg as CapabilityName | undefined;
  if (verb === undefined || !(verb in CAPABILITY_RUNNERS)) {
    writeUsage();
    return 1;
  }

  try {
    const runCapabilityCli = await loadCapabilityRunner(
      verb,
      options.importModule ?? ((specifier) => import(specifier)),
    );
    return await runCapabilityCli(restArgs);
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
        `Missing capability package ${JSON.stringify(entry.packageName)}. Install with: pnpm add -D @cmx-tools/cli ${entry.packageName}`,
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
    "Usage: cmx <assets|bundle|document|environment|verify|publish> [...args]\n",
  );
}

function writeHelp(): void {
  process.stdout.write(
    [
      "cmx",
      "",
      "Usage:",
      "  cmx <assets|bundle|document|environment|verify|publish> [...args]",
      "",
      "Examples:",
      '  cmx assets prepare "pages/**/*.tsx"',
      '  cmx bundle compile "pages/**/*.tsx" dist',
      "  cmx document render dist --out-dir documents",
      "  cmx environment generate dist/cmx-environment.ts",
      "  cmx verify validate documents/home.json",
      "  cmx publish documents.json http://localhost:3000/cmx",
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
