export type ExternalUsageRef = {
  from: string;
  import?: string;
};

type ManifestExternalRef = {
  from: string;
  imports?: string[];
  default?: true;
};

export function createExternalsManifest(
  usedRefs: ExternalUsageRef[],
): { externals: ManifestExternalRef[] } {
  const mergedByModule = new Map<
    string,
    { hasDefault: boolean; imports: Set<string> }
  >();

  for (const ref of usedRefs) {
    const current = mergedByModule.get(ref.from) ?? {
      hasDefault: false,
      imports: new Set<string>(),
    };

    if (ref.import === undefined) {
      current.hasDefault = true;
    } else {
      current.imports.add(ref.import);
    }

    mergedByModule.set(ref.from, current);
  }

  const externals = [...mergedByModule.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([from, entry]) => {
      const manifestEntry: ManifestExternalRef = { from };
      const imports = [...entry.imports].sort((left, right) =>
        left.localeCompare(right),
      );
      if (imports.length > 0) {
        manifestEntry.imports = imports;
      }
      if (entry.hasDefault) {
        manifestEntry.default = true;
      }
      return manifestEntry;
    });

  return { externals };
}
