import type {
  CmxDependency,
  CmxEnvironmentEntry,
  CmxExportConfig,
  CmxTypeRef,
} from "cmx-contracts";

export function createCmxEnvironmentModuleSource(input: {
  entries: CmxEnvironmentEntry[];
  dependencies: CmxDependency[];
  exports: Record<string, CmxExportConfig>;
}): string {
  const usedNames = new Set<string>();
  const exportTypeImports = toEnvironmentExportTypeImports(
    input.exports,
    usedNames,
  );
  const localNames = toEnvironmentLocalNames(input.entries, usedNames);
  const sortedDependencies = [...input.dependencies].sort((left, right) =>
    left.name.localeCompare(right.name),
  );
  const importLines = [
    'import type { CmxEnvironment } from "cmx-contracts";',
    ...exportTypeImports.map((entry) => entry.importLine),
    ...input.entries.flatMap((entry, index) => [
      `import * as ${localNames[index]?.implementation} from ${JSON.stringify(entry.implementation ?? entry.contract)};`,
      ...(entry.implementation
        ? [
            `import type * as ${localNames[index]?.publicContract} from ${JSON.stringify(entry.contract)};`,
          ]
        : []),
    ]),
  ];
  const exportOpen =
    "export const environment: CmxEnvironment<CmxEnvironmentExports> = {";

  return [
    ...importLines,
    ...(importLines.length > 0 ? [""] : []),
    "type CmxEnvironmentExports = {",
    ...Object.entries(input.exports).map(([name, config]) =>
      config.required
        ? `  ${JSON.stringify(name)}: ${toEnvironmentExportType(config, exportTypeImports)};`
        : `  ${JSON.stringify(name)}?: ${toEnvironmentExportType(config, exportTypeImports)};`,
    ),
    "};",
    "",
    exportOpen,
    `  dependencies: ${formatDependencies(sortedDependencies)},`,
    "  imports: {",
    ...input.entries.map((entry, index) =>
      entry.implementation
        ? `    ${JSON.stringify(entry.contract)}: ${localNames[index]?.implementation} satisfies typeof ${localNames[index]?.publicContract},`
        : `    ${JSON.stringify(entry.contract)}: ${localNames[index]?.implementation},`,
    ),
    "  },",
    "};",
    "",
  ].join("\n");
}

type CmxEnvironmentLocalName = {
  implementation: string;
  publicContract?: string;
};

type CmxEnvironmentTypeImport = {
  ref: CmxTypeRef;
  localName: string;
  importLine: string;
};

function toEnvironmentLocalNames(
  entries: CmxEnvironmentEntry[],
  usedNames: Set<string>,
): CmxEnvironmentLocalName[] {
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

function toEnvironmentExportTypeImports(
  exports: Record<string, CmxExportConfig>,
  usedNames: Set<string>,
): CmxEnvironmentTypeImport[] {
  const importsByKey = new Map<string, CmxEnvironmentTypeImport>();

  for (const config of Object.values(exports)) {
    if (!config.type) {
      continue;
    }

    const key = `${config.type.from}#${config.type.import ?? "default"}`;
    if (importsByKey.has(key)) {
      continue;
    }

    const localName = claimLocalName(
      usedNames,
      `${config.type.from}/${config.type.import ?? "default"}`,
    );

    importsByKey.set(key, {
      ref: config.type,
      localName,
      importLine:
        config.type.import === undefined
          ? `import type ${localName} from ${JSON.stringify(config.type.from)};`
          : `import type { ${config.type.import} as ${localName} } from ${JSON.stringify(config.type.from)};`,
    });
  }

  return [...importsByKey.values()];
}

function toEnvironmentExportType(
  config: CmxExportConfig,
  imports: CmxEnvironmentTypeImport[],
): string {
  if (!config.type) {
    return "unknown";
  }

  const key = `${config.type.from}#${config.type.import ?? "default"}`;
  const imported = imports.find(
    (entry) => `${entry.ref.from}#${entry.ref.import ?? "default"}` === key,
  );
  return imported?.localName ?? "unknown";
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
