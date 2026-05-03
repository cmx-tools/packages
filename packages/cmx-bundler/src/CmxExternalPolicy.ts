export type CmxExternalPolicy = {
  contracts: string[];
  invalidContracts: string[];
};

export type CmxExternalEntry = string | CmxStructuredExternalEntry;

export type CmxStructuredExternalEntry = {
  contract: string;
  implementation: string;
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
      typeof entry.implementation === "string"
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
  canonicalId: string,
  policy: CmxExternalPolicy,
): boolean {
  for (const contract of policy.contracts) {
    if (matchesExternalContract(canonicalId, contract)) {
      return true;
    }
  }
  return false;
}

function matchesExternalContract(
  canonicalId: string,
  contract: string,
): boolean {
  return contract === canonicalId || canonicalId.startsWith(`${contract}/`);
}

function isInvalidPackageContract(contract: string): boolean {
  return contract.includes("*") || contract === "<invalid object external>";
}
