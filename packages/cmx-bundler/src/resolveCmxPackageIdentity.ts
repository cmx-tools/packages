import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { PluginContext } from "rolldown";

export type CmxPackageIdentity =
  | {
      result: "resolved";
      resolvedId: string;
      packageJsonPath: string;
      packageName: string;
      packageVersion: string;
    }
  | {
      result: "external";
      resolvedId: string;
    }
  | {
      result: "invalid-package-name";
      packageJsonPath: string;
    }
  | {
      result: "invalid-package-version";
      resolvedId: string;
      packageJsonPath: string;
      packageName: string;
    }
  | {
      result: "missing-package-json";
      resolvedId: string;
    }
  | {
      result: "unresolved";
    };

export async function resolveCmxPackageIdentity(
  context: PluginContext,
  input: {
    importSpecifier: string;
    importerId: string;
  },
): Promise<CmxPackageIdentity> {
  const resolved = await context.resolve(
    input.importSpecifier,
    input.importerId,
    {
      skipSelf: true,
    },
  );

  if (resolved?.external) {
    return {
      result: "external",
      resolvedId: resolved.id ?? input.importSpecifier,
    };
  }

  const resolvedId = resolved?.id;
  const packageJsonPath =
    resolved?.packageJsonPath ??
    (resolvedId && path.isAbsolute(resolvedId)
      ? findNearestPackageJson(resolvedId)
      : undefined) ??
    (!resolved
      ? findNodeModulesPackageJson(input.importSpecifier, input.importerId)
      : undefined);

  if (!resolved && !packageJsonPath) {
    return { result: "unresolved" };
  }

  if (!packageJsonPath) {
    return {
      result: "missing-package-json",
      resolvedId: resolvedId ?? input.importSpecifier,
    };
  }

  const packageSource = readFileSync(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageSource) as {
    name?: unknown;
    version?: unknown;
  };
  if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
    return {
      result: "invalid-package-name",
      packageJsonPath,
    };
  }
  if (
    typeof packageJson.version !== "string" ||
    packageJson.version.length === 0
  ) {
    return {
      result: "invalid-package-version",
      resolvedId: resolvedId ?? packageJsonPath,
      packageJsonPath,
      packageName: packageJson.name,
    };
  }

  return {
    result: "resolved",
    resolvedId: resolvedId ?? packageJsonPath,
    packageJsonPath,
    packageName: packageJson.name,
    packageVersion: packageJson.version,
  };
}

function findNearestPackageJson(resolvedId: string): string | undefined {
  let currentDir = path.dirname(resolvedId);
  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");
    if (existsSync(packageJsonPath)) {
      return packageJsonPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

function findNodeModulesPackageJson(
  importSpecifier: string,
  importerId: string,
): string | undefined {
  const packageName = packageNameFromImportSpecifier(importSpecifier);
  if (!packageName) {
    return undefined;
  }

  let currentDir = path.dirname(importerId);
  while (true) {
    const packageJsonPath = path.join(
      currentDir,
      "node_modules",
      ...packageName.split("/"),
      "package.json",
    );
    if (existsSync(packageJsonPath)) {
      return packageJsonPath;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return undefined;
    }
    currentDir = parentDir;
  }
}

function packageNameFromImportSpecifier(
  importSpecifier: string,
): string | undefined {
  if (importSpecifier.startsWith(".") || path.isAbsolute(importSpecifier)) {
    return undefined;
  }

  const parts = importSpecifier.split("/");
  if (importSpecifier.startsWith("@")) {
    return parts.length >= 2 ? `${parts[0]}/${parts[1]}` : undefined;
  }

  return parts[0];
}
