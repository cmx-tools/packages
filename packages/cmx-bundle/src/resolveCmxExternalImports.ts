import type { TransformPluginContext } from "rolldown";
import { parseSync } from "rolldown/utils";
import type { CmxExternalPolicy } from "./CmxExternalPolicy.js";
import { matchesCmxExternalPolicy } from "./CmxExternalPolicy.js";
import { resolveCmxPackageIdentity } from "./resolveCmxPackageIdentity.js";

export type CmxResolvedExternalImport = {
  contract: string;
  importSpecifier: string;
  publicImportSpecifier: string;
};

export async function resolveCmxExternalImports(
  context: TransformPluginContext,
  source: string,
  id: string,
  externalPolicy: CmxExternalPolicy,
): Promise<Map<string, CmxResolvedExternalImport>> {
  const externalImports = new Map<string, CmxResolvedExternalImport>();
  if (externalPolicy.contracts.length === 0) {
    return externalImports;
  }

  const parsed = parseSync(id, source, {
    range: true,
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    return externalImports;
  }

  for (const staticImport of parsed.module.staticImports) {
    const importSpecifier = staticImport.moduleRequest.value;
    if (externalImports.has(importSpecifier)) {
      continue;
    }

    const packageIdentity = await resolveCmxPackageIdentity(context, {
      importSpecifier,
      importerId: id,
    });
    const resolvedPackageName =
      packageIdentity.result === "resolved"
        ? packageIdentity.packageName
        : packageIdentity.result === "invalid-package-version"
          ? packageIdentity.packageName
          : undefined;
    const contract =
      (resolvedPackageName
        ? matchingContract(resolvedPackageName, externalPolicy)
        : undefined) ??
      (packageIdentity.result === "unresolved" ||
      packageIdentity.result === "external"
        ? rawMatchingContract(importSpecifier, externalPolicy)
        : undefined);

    if (contract) {
      externalImports.set(importSpecifier, {
        contract,
        importSpecifier,
        publicImportSpecifier: toPublicImportSpecifier(
          importSpecifier,
          contract,
        ),
      });
      continue;
    }
  }

  return externalImports;
}

function matchingContract(
  packageName: string,
  externalPolicy: CmxExternalPolicy,
): string | undefined {
  return externalPolicy.contracts.find((contract) => contract === packageName);
}

function rawMatchingContract(
  importSpecifier: string,
  externalPolicy: CmxExternalPolicy,
): string | undefined {
  const packageName = packageNameFromImportSpecifier(importSpecifier);
  return packageName &&
    matchesCmxExternalPolicy(importSpecifier, externalPolicy)
    ? matchingContract(packageName, externalPolicy)
    : undefined;
}

function toPublicImportSpecifier(
  importSpecifier: string,
  contract: string,
): string {
  const packageName = packageNameFromImportSpecifier(importSpecifier);
  if (!packageName) {
    return contract;
  }

  const subpath = importSpecifier.slice(packageName.length);
  return `${contract}${subpath}`;
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
