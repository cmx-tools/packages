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

  return packageExportSubpaths(packageJson.exports);
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

function packageExportSubpaths(
  exportsValue: unknown,
): CmxImplementationPackageExports {
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

  if (entries.every(([key]) => isRootOnlyConditionalExportKey(key))) {
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

function isRootOnlyConditionalExportKey(key: string): boolean {
  return !key.startsWith(".") && !key.includes("*") && key.trim().length > 0;
}
