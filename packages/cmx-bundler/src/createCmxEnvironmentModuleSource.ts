import type {
  CmxDependency,
  CmxEnvironmentEntry,
  CmxTypeRef,
} from "cmx-contracts";

export function createCmxEnvironmentModuleSource(input: {
  entries: CmxEnvironmentEntry[];
  dependencies: CmxDependency[];
  metaType?: CmxTypeRef;
}): string {
  const localNames = toEnvironmentLocalNames(input.entries);
  const sortedDependencies = [...input.dependencies].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const metaTypeName = input.metaType?.import;
  const importLines = [
    ...(metaTypeName && input.metaType
      ? [
          `import type { ${metaTypeName} } from ${JSON.stringify(input.metaType.from)};`,
        ]
      : []),
    'import type { CmxEnvironment } from "cmx-contracts";',
    ...input.entries.flatMap((entry, index) => [
      `import * as ${localNames[index]?.implementation} from ${JSON.stringify(entry.implementation ?? entry.contract)};`,
      ...(entry.implementation
        ? [
            `import type * as ${localNames[index]?.publicContract} from ${JSON.stringify(entry.contract)};`,
          ]
        : []),
    ]),
  ];
  const exportOpen = metaTypeName
    ? `export const environment: CmxEnvironment<${metaTypeName}> = {`
    : "export const environment: CmxEnvironment = {";

  return [
    ...importLines,
    ...(importLines.length > 0 ? [""] : []),
    exportOpen,
    `  dependencies: ${formatDependencies(sortedDependencies)},`,
    "  imports: {",
    ...input.entries.map((entry, index) =>
      entry.implementation
        ? `    ${JSON.stringify(entry.contract)}: ${localNames[index]?.implementation} satisfies typeof ${localNames[index]?.publicContract},`
        : `    ${JSON.stringify(entry.contract)}: ${localNames[index]?.implementation},`,
    ),
    "  },",
    ...formatMetaType(input.metaType),
    "};",
    "",
  ].join("\n");
}

type CmxEnvironmentLocalName = {
  implementation: string;
  publicContract?: string;
};

function toEnvironmentLocalNames(
  entries: CmxEnvironmentEntry[],
): CmxEnvironmentLocalName[] {
  const usedNames = new Set<string>();

  return entries.map((entry) => ({
    implementation: claimLocalName(
      usedNames,
      entry.implementation ?? entry.contract,
    ),
    ...(entry.implementation
      ? { publicContract: claimLocalName(usedNames, entry.contract) }
      : {}),
  }));
}

function claimLocalName(usedNames: Set<string>, specifier: string): string {
  const localName = toImportSpecifierLocalName(specifier);

  for (let duplicateIndex = 0; ; duplicateIndex += 1) {
    const candidate =
      duplicateIndex === 0 ? localName : `${localName}${duplicateIndex}`;

    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
  }
}

function toImportSpecifierLocalName(specifier: string): string {
  const extensionlessSpecifier = specifier.replace(/\.[cm]?[jt]sx?$/, "");
  const words = extensionlessSpecifier.match(/[a-zA-Z0-9]+/g) ?? ["import"];
  const localName = words.map(toPascalCaseWord).join("");

  return /^\d/.test(localName) ? `Import${localName}` : localName;
}

function toPascalCaseWord(word: string): string {
  return `${word.slice(0, 1).toUpperCase()}${word.slice(1).toLowerCase()}`;
}

function formatDependencies(dependencies: CmxDependency[]): string {
  if (dependencies.length === 0) {
    return "[]";
  }

  return [
    "[",
    ...dependencies.flatMap((dependency) => [
      "    {",
      `      name: ${JSON.stringify(dependency.name)},`,
      `      specifier: ${JSON.stringify(dependency.specifier)},`,
      `      version: ${JSON.stringify(dependency.version)},`,
      ...(dependency.integrity === undefined
        ? []
        : [`      integrity: ${JSON.stringify(dependency.integrity)},`]),
      "    },",
    ]),
    "  ]",
  ].join("\n");
}

function formatMetaType(metaType: CmxTypeRef | undefined): string[] {
  if (!metaType) {
    return [];
  }

  return [
    "  metaType: {",
    `    from: ${JSON.stringify(metaType.from)},`,
    ...(metaType.import
      ? [`    import: ${JSON.stringify(metaType.import)},`]
      : []),
    "  },",
  ];
}
