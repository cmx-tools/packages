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
  sectionOverrides: Partial<CmxContractConfig>;
  dottedOverrides: Array<{ path: string[]; value: unknown }>;
};

export async function resolveCmxCliConfig(
  options: ResolveCmxCliConfigOptions = {},
): Promise<CmxContractConfig> {
  const env = options.env ?? process.env;
  const parsed = parseCliOptions(options.argv ?? []);
  const resolvedCwd = parsed.cwd ?? env.CMX_CWD ?? options.cwd ?? process.cwd();
  const configFile = parsed.configFile ?? env.CMX_CONFIG;
  const loadedConfig = await withScopedProcessEnv(env, async () =>
    loadCmxConfig({
      cwd: resolvedCwd,
      configFile,
      nodeEnv: env.NODE_ENV,
    }),
  );
  const withSectionOverrides = {
    ...loadedConfig,
    ...parsed.sectionOverrides,
  };
  const withDottedOverrides = applyDottedOverrides(
    withSectionOverrides,
    parsed.dottedOverrides,
  );
  return mergeExternalOverrides(withDottedOverrides, parsed.externals);
}

type LoadCmxConfigOptions = {
  cwd: string;
  configFile?: string;
  nodeEnv?: string;
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
      dotenv: {
        fileName: [".env", `.env.${options.nodeEnv ?? "development"}`],
      },
    });
    return loaded.config;
  } catch (cause) {
    throw new Error("Failed to resolve CMX config", { cause });
  }
}

function parseCliOptions(argv: readonly string[]): ParsedCliOptions {
  const parsed: ParsedCliOptions = {
    externals: [],
    sectionOverrides: {},
    dottedOverrides: [],
  };

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
    if (argument === "--exports") {
      parsed.sectionOverrides.exports = parseJsonFlag(
        readFlagValue(argv, index, "--exports"),
        "--exports",
      ) as CmxContractConfig["exports"];
      index += 1;
      continue;
    }
    if (argument === "--externals") {
      parsed.sectionOverrides.externals = parseJsonFlag(
        readFlagValue(argv, index, "--externals"),
        "--externals",
      ) as CmxContractConfig["externals"];
      index += 1;
      continue;
    }
    if (argument.startsWith("--") && argument.includes(".")) {
      parsed.dottedOverrides.push({
        path: argument.slice(2).split("."),
        value: coerceDottedValue(readFlagValue(argv, index, argument)),
      });
      index += 1;
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
  const contract = external.slice(0, splitIndex);
  if (contract.length === 0) {
    throw syntaxError("Invalid --external syntax");
  }
  const rawImplementation = external.slice(splitIndex + 1);
  if (rawImplementation.startsWith("{")) {
    const implementationMap = parseJsonFlag(rawImplementation, "--external");
    if (
      !isRecord(implementationMap) ||
      Object.values(implementationMap).some(
        (value) => typeof value !== "string",
      )
    ) {
      throw syntaxError("Invalid --external implementation map");
    }
    return {
      contract,
      implementation: implementationMap as Record<string, string>,
    };
  }
  return {
    contract,
    implementation: rawImplementation,
  };
}

function parseJsonFlag(input: string, flag: string): unknown {
  try {
    return JSON.parse(input) as unknown;
  } catch {
    throw syntaxError(`Malformed JSON for ${flag}`);
  }
}

function coerceDottedValue(input: string): unknown {
  if (input === "true") {
    return true;
  }
  if (input === "false") {
    return false;
  }
  if (input === "null") {
    return null;
  }
  return input;
}

function applyDottedOverrides(
  config: CmxContractConfig,
  overrides: ParsedCliOptions["dottedOverrides"],
): CmxContractConfig {
  if (overrides.length === 0) {
    return config;
  }
  const resolved = { ...config } as Record<string, unknown>;
  for (const override of overrides) {
    let cursor = resolved;
    for (let index = 0; index < override.path.length - 1; index += 1) {
      const part = override.path[index];
      const current = cursor[part];
      if (!isRecord(current)) {
        cursor[part] = {};
      }
      cursor = cursor[part] as Record<string, unknown>;
    }
    cursor[override.path[override.path.length - 1]] = override.value;
  }
  return resolved as CmxContractConfig;
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function syntaxError(message: string): Error {
  return new Error(`CMX CLI config syntax error: ${message}`);
}

async function withScopedProcessEnv<T>(
  env: NodeJS.ProcessEnv,
  run: () => Promise<T>,
): Promise<T> {
  const previous = process.env;
  process.env = { ...previous, ...env };
  try {
    return await run();
  } finally {
    process.env = previous;
  }
}
