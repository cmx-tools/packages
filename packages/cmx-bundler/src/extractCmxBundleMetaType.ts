import { readFileSync } from "node:fs";
import path from "node:path";
import type { Program, StaticImport, VariableDeclarator } from "oxc-parser";
import { ImportNameKind, parseSync } from "oxc-parser";
import type { CmxTypeRef } from "cmx-contracts";
import { normalizeModulePath } from "./normalizeModulePath.js";

type TypeAnnotatedMetaBinding = {
  type: "Identifier";
  name: "meta";
  typeAnnotation?: {
    typeAnnotation?: {
      type: string;
      start: number;
      typeArguments?: unknown;
      typeName?: {
        type: string;
        name?: string;
        start: number;
      };
    };
  };
};

export type CmxBundleMetaTypeExtraction =
  | {
      result: "none";
    }
  | {
      result: "resolved";
      ref: CmxTypeRef;
    }
  | {
      result: "unsupported";
      position: number;
    };

type MetaTypeNameExtraction =
  | {
      result: "none";
    }
  | {
      result: "resolved";
      name: string;
      position: number;
    }
  | {
      result: "unsupported";
      position: number;
    };

export function extractCmxBundleMetaType(
  source: string,
  id: string,
): CmxBundleMetaTypeExtraction {
  const metaSource = authoredEntrySourceForMeta(id, source);
  const parsed = parseSync(id, metaSource, {
    range: true,
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    return { result: "none" };
  }

  const exportedMetaType = exportedMetaTypeName(parsed.program);
  if (exportedMetaType.result !== "resolved") {
    return exportedMetaType;
  }

  const metaType = importedTypeBindings(parsed.module.staticImports).get(
    exportedMetaType.name,
  );
  return metaType
    ? { result: "resolved", ref: metaType }
    : { result: "unsupported", position: exportedMetaType.position };
}

function authoredEntrySourceForMeta(
  id: string,
  transformSource: string,
): string {
  if (id.includes("\0")) {
    return transformSource;
  }
  const resolved = normalizeModulePath(id);
  try {
    return readFileSync(resolved, "utf8");
  } catch {
    return transformSource;
  }
}

function importedTypeBindings(
  staticImports: StaticImport[],
): Map<string, CmxTypeRef> {
  const bindings = new Map<string, CmxTypeRef>();
  for (const staticImport of staticImports) {
    if (!isExternalTypeSource(staticImport.moduleRequest.value)) {
      continue;
    }

    for (const entry of staticImport.entries) {
      if (!entry.isType) {
        continue;
      }

      if (entry.importName.kind === ImportNameKind.Default) {
        bindings.set(entry.localName.value, {
          from: staticImport.moduleRequest.value,
        });
        continue;
      }

      if (entry.importName.kind === ImportNameKind.Name) {
        const importName = entry.importName.name;
        if (!importName || importName === "default") {
          continue;
        }
        bindings.set(entry.localName.value, {
          from: staticImport.moduleRequest.value,
          import: importName,
        });
      }
    }
  }
  return bindings;
}

function isExternalTypeSource(source: string): boolean {
  return !source.startsWith(".") && !path.isAbsolute(source);
}

function exportedMetaTypeName(program: Program): MetaTypeNameExtraction {
  for (const statement of program.body) {
    if (
      statement.type !== "ExportNamedDeclaration" ||
      !statement.declaration ||
      statement.declaration.type !== "VariableDeclaration"
    ) {
      continue;
    }

    for (const declaration of statement.declaration.declarations) {
      const typeName = metaVariableTypeName(declaration);
      if (typeName.result !== "none") {
        return typeName;
      }
    }
  }
  return { result: "none" };
}

function metaVariableTypeName(
  declaration: VariableDeclarator,
): MetaTypeNameExtraction {
  const binding: unknown = declaration.id;
  if (!isTypeAnnotatedMetaBinding(binding)) {
    return { result: "none" };
  }

  const typeAnnotation = binding.typeAnnotation?.typeAnnotation;
  if (!typeAnnotation) {
    return { result: "none" };
  }

  if (
    typeAnnotation.type !== "TSTypeReference" ||
    typeAnnotation.typeArguments ||
    !typeAnnotation.typeName ||
    typeAnnotation.typeName.type !== "Identifier" ||
    typeof typeAnnotation.typeName.name !== "string"
  ) {
    return { result: "unsupported", position: typeAnnotation.start };
  }

  return {
    result: "resolved",
    name: typeAnnotation.typeName.name,
    position: typeAnnotation.typeName.start,
  };
}

function isTypeAnnotatedMetaBinding(
  value: unknown,
): value is TypeAnnotatedMetaBinding {
  return (
    isRecord(value) &&
    value.type === "Identifier" &&
    value.name === "meta" &&
    (value.typeAnnotation === undefined || isRecord(value.typeAnnotation))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
