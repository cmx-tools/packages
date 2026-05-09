import type {
  CmxExternalEntry,
  CmxExactImplementationExportMap,
} from "cmx-contracts";

export type CmxExternalPolicy = {
  contracts: string[];
  invalidContracts: string[];
};

export function createCmxExternalPolicy(
  externals: CmxExternalEntry[],
): CmxExternalPolicy {
  const normalizedContracts = externals.flatMap((entry) => {
    if (typeof entry === "string") {
      return [entry.trim()];
    }

    if (
      typeof entry.contract === "string" &&
      (typeof entry.implementation === "string" ||
        isExactImplementationExportMap(entry.implementation))
    ) {
      return [entry.contract.trim()];
    }

    return ["<invalid object external>"];
  });

  return {
    contracts: normalizedContracts
      .filter((entry) => entry.length > 0)
      .map((entry) => entry.replace(/\/+$/u, ""))
      .filter((contract) => !isInvalidPackageContract(contract)),
    invalidContracts: normalizedContracts
      .filter((entry) => entry.length > 0)
      .map((entry) => entry.replace(/\/+$/u, ""))
      .filter(isInvalidPackageContract),
  };
}

export function matchesCmxExternalPolicy(
  importSpecifier: string,
  policy: CmxExternalPolicy,
): boolean {
  const packageName = packageNameFromImportSpecifier(importSpecifier);
  if (!packageName) {
    return false;
  }

  for (const contract of policy.contracts) {
    if (packageName === contract) {
      return true;
    }
  }
  return false;
}

function isInvalidPackageContract(contract: string): boolean {
  if (contract.includes("*") || contract === "<invalid object external>") {
    return true;
  }

  return packageNameFromImportSpecifier(contract) !== contract;
}

export function isExactImplementationExportMap(
  implementation: unknown,
): implementation is CmxExactImplementationExportMap {
  if (
    typeof implementation !== "object" ||
    implementation === null ||
    Array.isArray(implementation)
  ) {
    return false;
  }

  const entries = Object.entries(implementation);
  return (
    entries.length > 0 &&
    entries.every(
      ([key, value]) =>
        isExactImplementationExportMapKey(key) &&
        typeof value === "string" &&
        value.trim().length > 0 &&
        !value.includes("*"),
    )
  );
}

function isExactImplementationExportMapKey(key: string): boolean {
  if (key.includes("*")) {
    return false;
  }

  return key === "." || (key.startsWith("./") && key.length > 2);
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
