import type { CmxEnvironmentEntry, CmxTypeRef } from "cmx-bundle";

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
  const metaImportLine =
    metaTypeName !== undefined && input.metaType
      ? `import type { ${metaTypeName} } from ${JSON.stringify(
          input.metaType.from,
        )};\n\n`
      : "";

  const exportOpen =
    metaTypeName !== undefined
      ? `export const environment: CmxEnvironment<${metaTypeName}> = {`
      : "export const environment: CmxEnvironment = {";

  return {
    source: [
      metaImportLine,
      "type CmxDependency = {",
      "  name: string;",
      "  specifier: string;",
      "  version: string;",
      "  integrity?: string;",
      "};",
      "",
      "type CmxTypeRef = {",
      "  from: string;",
      "  import?: string;",
      "};",
      "",
      "type CmxEnvironment<Meta = unknown> = {",
      "  dependencies: CmxDependency[];",
      "  imports: Record<string, Record<string, unknown>>;",
      "  metaType?: CmxTypeRef;",
      "  __meta?: Meta;",
      "};",
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
