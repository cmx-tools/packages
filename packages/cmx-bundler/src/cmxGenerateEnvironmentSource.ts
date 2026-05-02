import type { CmxEnvironmentEntry, CmxTypeRef } from "cmx-contracts";

export type CmxGenerateEnvironmentSourceInput = {
  entries: CmxEnvironmentEntry[];
  metaType?: CmxTypeRef;
};

export type CmxGenerateEnvironmentSourceResult = {
  source: string;
};

export function cmxGenerateEnvironmentSource(
  input: CmxGenerateEnvironmentSourceInput,
): CmxGenerateEnvironmentSourceResult {
  const metaTypeName = input.metaType?.import;
  const importLines = [
    ...(metaTypeName !== undefined && input.metaType
      ? [
          `import type { ${metaTypeName} } from ${JSON.stringify(
            input.metaType.from,
          )};`,
        ]
      : []),
    'import type { CmxEnvironment } from "cmx-contracts";',
  ];

  const exportOpen =
    metaTypeName !== undefined
      ? `export const environment: CmxEnvironment<${metaTypeName}> = {`
      : "export const environment: CmxEnvironment = {";

  return {
    source: [
      ...importLines,
      "",
      exportOpen,
      "  dependencies: [],",
      "  imports: {",
      ...input.entries.map(
        (entry) => `    ${JSON.stringify(entry.as ?? entry.from)}: {},`,
      ),
      "  },",
      ...(input.metaType
        ? [
            "  metaType: {",
            `    from: ${JSON.stringify(input.metaType.from)},`,
            ...(input.metaType.import
              ? [`    import: ${JSON.stringify(input.metaType.import)},`]
              : []),
            "  },",
          ]
        : []),
      "};",
      "",
    ].join("\n"),
  };
}
