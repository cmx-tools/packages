import type { CmxContractConfig, CmxExternalEntry } from "cmx-contracts";
import { loadConfig } from "c12";

export type ResolveCmxCliConfigOptions = {
  argv?: readonly string[];
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

type ParsedCliOptions = {
  cwd?: string;
  configFile?: string;
  externals: string[];
};

export async function resolveCmxCliConfig(
  options: ResolveCmxCliConfigOptions = {},
): Promise<CmxContractConfig> {
  const env = options.env ?? process.env;
  const parsed = parseCliOptions(options.argv ?? []);
  const resolvedCwd = parsed.cwd ?? env.CMX_CWD ?? options.cwd ?? process.cwd();
  const configFile = parsed.configFile ?? env.CMX_CONFIG;
  const loadedConfig = await loadCmxConfig({
    cwd: resolvedCwd,
    configFile,
  });
  return mergeExternalOverrides(loadedConfig, parsed.externals);
}

type LoadCmxConfigOptions = {
  cwd: string;
  configFile?: string;
};

async function loadCmxConfig(
  options: LoadCmxConfigOptions,
): Promise<CmxContractConfig> {
  try {
    const loaded = await loadConfig<CmxContractConfig>({
      name: "cmx",
      cwd: options.cwd,
      configFile: options.configFile,
      configFileRequired: options.configFile !== undefined,
      rcFile: ".cmxrc",
      globalRc: false,
      packageJson: true,
      dotenv: true,
    });
    return loaded.config;
  } catch (cause) {
    throw new Error("Failed to resolve CMX config", { cause });
  }
}

function parseCliOptions(argv: readonly string[]): ParsedCliOptions {
  const parsed: ParsedCliOptions = { externals: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--cwd") {
      parsed.cwd = readFlagValue(argv, index, "--cwd");
      index += 1;
      continue;
    }
    if (argument === "--config") {
      parsed.configFile = readFlagValue(argv, index, "--config");
      index += 1;
      continue;
    }
    if (argument === "--external") {
      parsed.externals.push(readFlagValue(argv, index, "--external"));
      index += 1;
      continue;
    }
  }

  return parsed;
}

function readFlagValue(
  argv: readonly string[],
  index: number,
  flag: string,
): string {
  const value = argv[index + 1];
  if (value === undefined) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function mergeExternalOverrides(
  config: CmxContractConfig,
  externalFlags: readonly string[],
): CmxContractConfig {
  if (externalFlags.length === 0) {
    return config;
  }

  const resolvedExternals = [...(config.externals ?? [])];
  for (const external of externalFlags) {
    const parsed = parseExternal(external);
    const contract = typeof parsed === "string" ? parsed : parsed.contract;
    const existingIndex = resolvedExternals.findIndex((entry) =>
      typeof entry === "string"
        ? entry === contract
        : entry.contract === contract,
    );
    if (existingIndex >= 0) {
      resolvedExternals[existingIndex] = parsed;
      continue;
    }
    resolvedExternals.push(parsed);
  }

  return {
    ...config,
    externals: resolvedExternals,
  };
}

function parseExternal(external: string): CmxExternalEntry {
  const splitIndex = external.indexOf("=");
  if (splitIndex < 0) {
    return external;
  }
  return {
    contract: external.slice(0, splitIndex),
    implementation: external.slice(splitIndex + 1),
  };
}
