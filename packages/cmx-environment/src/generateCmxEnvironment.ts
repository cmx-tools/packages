import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import type {
  CmxDependency,
  CmxEnvironmentEntry,
  CmxExportConfig,
  CmxExternalEntry,
  CmxExactImplementationExportMap,
} from "cmx-contracts";
import { createCmxEnvironmentModuleSource } from "./createCmxEnvironmentModuleSource.js";

const COMPLEX_EXPORTS = "cmx-external-implementation-exports-complex";

export type CmxGetIntegrity = (context: {
  importSpecifier: string;
  importerId: string;
  resolvedId: string;
  packageJsonPath: string;
  packageName: string;
  packageVersion: string;
  consumerPackageJsonPath: string;
  specifier: string;
}) => string | null;

export async function generateCmxEnvironment(input: {
  cwd?: string;
  exports: Record<string, CmxExportConfig>;
  externals?: CmxExternalEntry[];
  getIntegrity?: CmxGetIntegrity;
}): Promise<{
  source: string;
  dependencies: CmxDependency[];
  entries: CmxEnvironmentEntry[];
}> {
  const cwd = path.resolve(input.cwd ?? process.cwd());
  const importerId = path.join(cwd, "__cmx_environment__.ts");
  const consumerPackageJsonPath = path.join(cwd, "package.json");
  const consumerPackage = await readConsumerPackageJson(
    consumerPackageJsonPath,
  );
  const entries = await toEnvironmentEntries(input.externals ?? [], importerId);
  const dependencies = await collectDependencies({
    entries,
    importerId,
    consumerPackageJsonPath,
    consumerPackage,
    getIntegrity: input.getIntegrity,
  });
  const source = createCmxEnvironmentModuleSource({
    exports: input.exports,
    entries,
    dependencies,
  });

  return { source, dependencies, entries };
}

type ConsumerPackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

async function readConsumerPackageJson(
  filePath: string,
): Promise<ConsumerPackageJson> {
  try {
    return JSON.parse(await readFile(filePath, "utf8")) as ConsumerPackageJson;
  } catch {
    throw new Error(`Could not read consumer package.json at ${filePath}.`);
  }
}

async function toEnvironmentEntries(
  externals: CmxExternalEntry[],
  importerId: string,
): Promise<CmxEnvironmentEntry[]> {
  const entries: CmxEnvironmentEntry[] = [];

  for (const entry of externals) {
    if (typeof entry === "string") {
      entries.push(
        ...(await toEnvironmentEntriesForStringImplementation(
          entry,
          entry,
          importerId,
        )),
      );
      continue;
    }

    if (
      typeof entry.contract === "string" &&
      typeof entry.implementation === "string"
    ) {
      entries.push(
        ...(await toEnvironmentEntriesForStringImplementation(
          entry.contract,
          entry.implementation,
          importerId,
        )),
      );
      continue;
    }

    if (
      typeof entry.contract === "string" &&
      isExactImplementationExportMap(entry.implementation)
    ) {
      entries.push(
        ...Object.entries(entry.implementation).map(
          ([subpath, implementation]) =>
            toEnvironmentEntry(
              contractImportSpecifier(entry.contract, subpath),
              implementation,
            ),
        ),
      );
    }
  }

  return entries.filter((entry) => entry.contract.trim().length > 0);
}

async function toEnvironmentEntriesForStringImplementation(
  contract: string,
  implementation: string,
  importerId: string,
): Promise<CmxEnvironmentEntry[]> {
  const discovered = await discoverImplementationPackageExports({
    implementation,
    importerId,
  });

  if (discovered.kind === "complex") {
    throw new Error(
      `(${COMPLEX_EXPORTS}) CMX cannot derive environment imports from complex exports for implementation ${JSON.stringify(implementation)}. Use an exact implementation export map instead.`,
    );
  }

  if (discovered.kind === "rootOnly") {
    return [toEnvironmentEntry(contract, implementation)];
  }

  return discovered.subpaths.map((subpath) =>
    toEnvironmentEntry(
      contractImportSpecifier(contract, subpath),
      implementationImportSpecifier(implementation, subpath),
    ),
  );
}

async function discoverImplementationPackageExports(input: {
  implementation: string;
  importerId: string;
}): Promise<
  | { kind: "simple"; subpaths: string[] }
  | { kind: "rootOnly" }
  | { kind: "complex" }
> {
  const packageJsonPath = await resolveImplementationPackageJsonPath(input);
  if (!packageJsonPath) {
    return { kind: "rootOnly" };
  }

  let packageJson: { exports?: unknown };
  try {
    packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      exports?: unknown;
    };
  } catch {
    return { kind: "rootOnly" };
  }

  if (packageJson.exports === undefined) {
    return { kind: "rootOnly" };
  }

  return packageExportSubpaths(packageJson.exports);
}

async function resolveImplementationPackageJsonPath(input: {
  implementation: string;
  importerId: string;
}): Promise<string | undefined> {
  if (
    input.implementation.startsWith(".") ||
    path.isAbsolute(input.implementation)
  ) {
    return undefined;
  }

  const require = createRequire(input.importerId);
  try {
    return require.resolve(`${input.implementation}/package.json`);
  } catch {
    return findPackageJsonFromNodeModules(
      input.implementation,
      path.dirname(input.importerId),
    );
  }
}

function packageExportSubpaths(
  exportsValue: unknown,
):
  | { kind: "simple"; subpaths: string[] }
  | { kind: "rootOnly" }
  | { kind: "complex" } {
  if (typeof exportsValue === "string") {
    return { kind: "simple", subpaths: ["."] };
  }

  if (
    typeof exportsValue !== "object" ||
    exportsValue === null ||
    Array.isArray(exportsValue)
  ) {
    return { kind: "complex" };
  }

  const entries = Object.entries(exportsValue);
  if (entries.length === 0) {
    return { kind: "complex" };
  }

  if (entries.every(([key]) => isExactPackageExportKey(key))) {
    return { kind: "simple", subpaths: entries.map(([key]) => key) };
  }

  if (
    entries.every(
      ([key]) =>
        !key.startsWith(".") && !key.includes("*") && key.trim().length > 0,
    )
  ) {
    return { kind: "rootOnly" };
  }

  return { kind: "complex" };
}

function isExactPackageExportKey(key: string): boolean {
  if (key.includes("*")) {
    return false;
  }

  return key === "." || (key.startsWith("./") && key.length > 2);
}

function toEnvironmentEntry(
  contract: string,
  implementation: string,
): CmxEnvironmentEntry {
  return implementation === contract
    ? { contract }
    : { contract, implementation };
}

function contractImportSpecifier(contract: string, subpath: string): string {
  return subpath === "." ? contract : `${contract}/${subpath.slice(2)}`;
}

function implementationImportSpecifier(
  implementation: string,
  subpath: string,
): string {
  return subpath === "."
    ? implementation
    : `${implementation}/${subpath.slice(2)}`;
}

async function collectDependencies(input: {
  entries: CmxEnvironmentEntry[];
  importerId: string;
  consumerPackageJsonPath: string;
  consumerPackage: ConsumerPackageJson;
  getIntegrity?: CmxGetIntegrity;
}): Promise<CmxDependency[]> {
  const dependencies = new Map<string, CmxDependency>();

  for (const entry of input.entries) {
    const publicImportSpecifier = entry.contract;
    const packageName = packageNameFromImportSpecifier(publicImportSpecifier);
    if (!packageName) {
      continue;
    }

    const resolved = await resolvePackageJsonPath(
      publicImportSpecifier,
      input.importerId,
    );
    if (!resolved) {
      throw new Error(
        `(cmx-external-resolve-failed) CMX could not resolve external import ${JSON.stringify(publicImportSpecifier)}.`,
      );
    }

    const packageJson = await readPackageIdentity(resolved);
    if (!packageJson) {
      throw new Error(
        `(cmx-external-missing-package-json) CMX could not determine a package for external import ${JSON.stringify(publicImportSpecifier)}.`,
      );
    }

    const specifier = findConsumerDependencySpecifier(
      input.consumerPackage,
      packageName,
    );
    if (specifier === undefined) {
      throw new Error(
        `(cmx-external-missing-consumer-dependency) Package ${JSON.stringify(packageName)} must be listed in the consumer package.json (dependencies, devDependencies, peerDependencies, or optionalDependencies) for CMX external imports.`,
      );
    }

    const integrityFromCallback = input.getIntegrity?.({
      importSpecifier: publicImportSpecifier,
      importerId: input.importerId,
      resolvedId: resolved,
      packageJsonPath: packageJson.packageJsonPath,
      packageName,
      packageVersion: packageJson.version,
      consumerPackageJsonPath: input.consumerPackageJsonPath,
      specifier,
    });

    dependencies.set(packageName, {
      name: packageName,
      specifier,
      version: packageJson.version,
      ...(integrityFromCallback && integrityFromCallback.length > 0
        ? { integrity: integrityFromCallback }
        : {}),
    });
  }

  return [...dependencies.values()];
}

async function resolvePackageJsonPath(
  importSpecifier: string,
  importerId: string,
): Promise<string | undefined> {
  const packageName = packageNameFromImportSpecifier(importSpecifier);
  if (!packageName) {
    return undefined;
  }

  const require = createRequire(importerId);
  try {
    return require.resolve(`${packageName}/package.json`);
  } catch {
    return findPackageJsonFromNodeModules(
      packageName,
      path.dirname(importerId),
    );
  }
}

async function readPackageIdentity(
  packageJsonPath: string,
): Promise<{ packageJsonPath: string; version: string } | undefined> {
  try {
    const value = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
      version?: unknown;
    };
    if (typeof value.version !== "string") {
      return undefined;
    }

    return {
      packageJsonPath,
      version: value.version,
    };
  } catch {
    return undefined;
  }
}

function findConsumerDependencySpecifier(
  consumerPackage: ConsumerPackageJson,
  packageName: string,
): string | undefined {
  return (
    consumerPackage.dependencies?.[packageName] ??
    consumerPackage.devDependencies?.[packageName] ??
    consumerPackage.peerDependencies?.[packageName] ??
    consumerPackage.optionalDependencies?.[packageName]
  );
}

function isExactImplementationExportMap(
  value: unknown,
): value is CmxExactImplementationExportMap {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const entries = Object.entries(value);
  return (
    entries.length > 0 &&
    entries.every(
      ([key, implementation]) =>
        isExactPackageExportKey(key) &&
        typeof implementation === "string" &&
        implementation.trim().length > 0 &&
        !implementation.includes("*"),
    )
  );
}

function packageNameFromImportSpecifier(
  importSpecifier: string,
): string | undefined {
  const parts = importSpecifier.split("/");
  if (importSpecifier.startsWith("@")) {
    return parts.length >= 2 && parts[1] !== ""
      ? `${parts[0]}/${parts[1]}`
      : undefined;
  }

  return parts[0] === "" ? undefined : parts[0];
}

async function findPackageJsonFromNodeModules(
  packageName: string,
  startDir: string,
): Promise<string | undefined> {
  let currentDir = startDir;

  while (true) {
    const candidate = path.join(
      currentDir,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    );
    try {
      await access(candidate);
      return candidate;
    } catch {}

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}
