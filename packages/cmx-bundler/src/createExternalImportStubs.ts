import type { TransformPluginContext } from "rolldown";
import { parseSync } from "rolldown/utils";
import type { CmxExternalPolicy } from "./CmxExternalPolicy.js";
import { matchesCmxExternalPolicy } from "./CmxExternalPolicy.js";

const EXTERNAL_STUB_PREFIX = "cmx-external:";

export const VIRTUAL_EXTERNAL_STUB_PREFIX = `\0${EXTERNAL_STUB_PREFIX}`;

export type ExternalStub = {
  from: string;
  hasDefault: boolean;
  namedImports: Set<string>;
};

export function externalStubIdFromSource(source: string): string | undefined {
  if (!source.startsWith(EXTERNAL_STUB_PREFIX)) {
    return undefined;
  }
  return `${VIRTUAL_EXTERNAL_STUB_PREFIX}${source.slice(EXTERNAL_STUB_PREFIX.length)}`;
}

export function createExternalStubSource(
  runtimeImportSource: string,
  stub: ExternalStub,
): string {
  const lines = [
    `import { __registerExternal } from ${JSON.stringify(`${runtimeImportSource}/jsx-runtime`)};`,
    `const __cmxFrom = ${JSON.stringify(stub.from)};`,
  ];

  if (stub.hasDefault) {
    lines.push("export default __registerExternal({ from: __cmxFrom });");
  }

  for (const importName of [...stub.namedImports].sort((left, right) =>
    left.localeCompare(right),
  )) {
    lines.push(
      `export const ${importName} = __registerExternal({ from: __cmxFrom, import: ${JSON.stringify(importName)} });`,
    );
  }

  return `${lines.join("\n")}\n`;
}

export async function transformExternalImports(
  context: TransformPluginContext,
  source: string,
  id: string,
  externalPolicy: CmxExternalPolicy,
  externalStubs: Map<string, ExternalStub>,
  resolveExternalImport?: (
    context: TransformPluginContext,
    importSpecifier: string,
    importerId: string,
  ) => Promise<void>,
): Promise<{ code: string; map: null } | null> {
  if (externalPolicy.patterns.length === 0) {
    return null;
  }

  const parsed = parseSync(id, source, {
    range: true,
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    return null;
  }

  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const externalImport of parsed.module.staticImports) {
    const from = externalImport.moduleRequest.value;
    if (!matchesCmxExternalPolicy(from, externalPolicy)) {
      continue;
    }

    const stub = externalStubFromImport(from, externalImport.entries);
    if (!stub) {
      continue;
    }

    if (resolveExternalImport) {
      await resolveExternalImport(context, from, id);
    }

    const stubId = createExternalStubId(id, from);
    externalStubs.set(
      stubId,
      mergeExternalStub(externalStubs.get(stubId), stub),
    );
    replacements.push({
      start: externalImport.moduleRequest.start,
      end: externalImport.moduleRequest.end,
      value: JSON.stringify(stubId),
    });
  }

  if (replacements.length === 0) {
    return null;
  }

  return {
    code: replaceRanges(source, replacements),
    map: null,
  };
}

function externalStubFromImport(
  from: string,
  entries: Array<{
    importName: { kind: string; name: string | null };
    isType: boolean;
  }>,
): ExternalStub | undefined {
  const stub: ExternalStub = {
    from,
    hasDefault: false,
    namedImports: new Set<string>(),
  };

  for (const entry of entries) {
    if (entry.isType) {
      continue;
    }

    if (entry.importName.kind === "Default") {
      stub.hasDefault = true;
      continue;
    }

    if (entry.importName.kind === "Name") {
      const importName = entry.importName.name;
      if (importName === "default") {
        stub.hasDefault = true;
      } else if (importName) {
        stub.namedImports.add(importName);
      }
    }
  }

  return stub.hasDefault || stub.namedImports.size > 0 ? stub : undefined;
}

function mergeExternalStub(
  current: ExternalStub | undefined,
  next: ExternalStub,
): ExternalStub {
  if (!current) {
    return next;
  }

  return {
    from: current.from,
    hasDefault: current.hasDefault || next.hasDefault,
    namedImports: new Set([...current.namedImports, ...next.namedImports]),
  };
}

function createExternalStubId(importer: string, from: string): string {
  return `${EXTERNAL_STUB_PREFIX}${Buffer.from(
    JSON.stringify({ importer, from }),
  ).toString("base64url")}`;
}

function replaceRanges(
  source: string,
  replacements: Array<{ start: number; end: number; value: string }>,
): string {
  let output = "";
  let position = 0;
  for (const replacement of replacements.sort((a, b) => a.start - b.start)) {
    output += source.slice(position, replacement.start);
    output += replacement.value;
    position = replacement.end;
  }
  return output + source.slice(position);
}
