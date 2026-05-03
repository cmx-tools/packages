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
      `import * as CmxEnvironmentImport${index} from ${JSON.stringify(entry.implementation ?? entry.contract)};`,
      ...(entry.implementation
        ? [
            `import type * as CmxEnvironmentPublic${index} from ${JSON.stringify(entry.contract)};`,
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
        ? `    ${JSON.stringify(entry.contract)}: CmxEnvironmentImport${index} satisfies typeof CmxEnvironmentPublic${index},`
        : `    ${JSON.stringify(entry.contract)}: CmxEnvironmentImport${index},`,
    ),
    "  },",
    ...formatMetaType(input.metaType),
    "};",
    "",
  ].join("\n");
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
