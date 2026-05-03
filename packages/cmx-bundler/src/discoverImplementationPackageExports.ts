import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { PluginContext } from "rolldown";

export type CmxImplementationPackageExports =
  | { kind: "simple"; subpaths: string[] }
  | { kind: "rootOnly" }
  | { kind: "complex" };

export async function discoverImplementationPackageExports(
  context: PluginContext,
  input: {
    implementation: string;
    importerId: string;
  },
): Promise<CmxImplementationPackageExports> {
  const packageJsonPath = await resolveImplementationPackageJsonPath(
    context,
    input,
  );
  if (!packageJsonPath) {
    return { kind: "rootOnly" };
  }

  let packageJson: { exports?: unknown };
  try {
    packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
      exports?: unknown;
    };
  } catch {
    return { kind: "rootOnly" };
  }

  if (packageJson.exports === undefined) {
    return { kind: "rootOnly" };
  }

  const subpaths = simpleExportSubpaths(packageJson.exports);
  return subpaths ? { kind: "simple", subpaths } : { kind: "complex" };
}

async function resolveImplementationPackageJsonPath(
  context: PluginContext,
  input: {
    implementation: string;
    importerId: string;
  },
): Promise<string | undefined> {
  const resolved = await context.resolve(
    input.implementation,
    input.importerId,
    {
      skipSelf: true,
    },
  );
  if (resolved?.packageJsonPath) {
    return resolved.packageJsonPath;
  }

  return findLocalPackageJson(input.implementation, input.importerId);
}

function findLocalPackageJson(
  implementation: string,
  importerId: string,
): string | undefined {
  if (!implementation.startsWith(".") && !path.isAbsolute(implementation)) {
    return undefined;
  }

  const absolutePath = path.resolve(path.dirname(importerId), implementation);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  const stats = statSync(absolutePath);
  if (!stats.isDirectory()) {
    return undefined;
  }

  const candidates = [path.join(absolutePath, "package.json")];

  return candidates.find((candidate) => existsSync(candidate));
}

function simpleExportSubpaths(exportsValue: unknown): string[] | undefined {
  if (typeof exportsValue === "string") {
    return ["."];
  }

  if (
    typeof exportsValue !== "object" ||
    exportsValue === null ||
    Array.isArray(exportsValue)
  ) {
    return undefined;
  }

  const entries = Object.entries(exportsValue);
  if (entries.length === 0) {
    return undefined;
  }

  const subpaths: string[] = [];
  for (const [key, value] of entries) {
    if (!isExactPackageExportKey(key) || !isSimplePackageExportValue(value)) {
      return undefined;
    }
    subpaths.push(key);
  }
  return subpaths;
}

function isExactPackageExportKey(key: string): boolean {
  if (key.includes("*")) {
    return false;
  }

  return key === "." || (key.startsWith("./") && key.length > 2);
}

function isSimplePackageExportValue(value: unknown): value is string {
  return (
    typeof value === "string" && value.trim().length > 0 && !value.includes("*")
  );
}
