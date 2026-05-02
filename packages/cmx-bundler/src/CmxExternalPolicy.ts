export type CmxExternalPolicy = {
  patterns: string[];
};

export type CmxExternalEntry = string | CmxStructuredExternalEntry;

export type CmxStructuredExternalEntry = {
  from: string;
  as?: string;
};

export function createCmxExternalPolicy(
  externals: CmxExternalEntry[],
): CmxExternalPolicy {
  return {
    patterns: externals
      .map((entry) => (typeof entry === "string" ? entry : entry.from).trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => {
        if (entry.endsWith("/**")) {
          const base = entry.slice(0, -3).replace(/\/+$/u, "");
          return `${base}/**`;
        }
        if (entry.endsWith("/*")) {
          const base = entry.slice(0, -2).replace(/\/+$/u, "");
          return `${base}/*`;
        }
        return entry.replace(/\/+$/u, "");
      }),
  };
}

export function matchesCmxExternalPolicy(
  canonicalId: string,
  policy: CmxExternalPolicy,
): boolean {
  for (const pattern of policy.patterns) {
    if (matchesExternalPattern(canonicalId, pattern)) {
      return true;
    }
  }
  return false;
}

function matchesExternalPattern(canonicalId: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const base = pattern.slice(0, -3);
    return canonicalId === base || canonicalId.startsWith(`${base}/`);
  }

  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    if (!canonicalId.startsWith(`${base}/`)) {
      return false;
    }

    const remainder = canonicalId.slice(base.length + 1);
    return remainder.length > 0 && !remainder.includes("/");
  }

  return pattern === canonicalId || canonicalId.startsWith(`${pattern}/`);
}
