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
  return {
    source: [
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
      "};",
      "",
      "export const environment = {",
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
      "} satisfies CmxEnvironment;",
      "",
    ].join("\n"),
  };
}
