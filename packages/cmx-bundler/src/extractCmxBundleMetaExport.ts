import { readFileSync } from "node:fs";
import type { ParseResult } from "rolldown/utils";
import { parseSync } from "rolldown/utils";
import { normalizeModulePath } from "./normalizeModulePath.js";

type Program = ParseResult["program"];
type ExportNamed = Extract<
  Program["body"][number],
  { type: "ExportNamedDeclaration" }
>;
type ExportedVariableDeclaration = Extract<
  NonNullable<ExportNamed["declaration"]>,
  { type: "VariableDeclaration" }
>;
type VariableDeclarator = ExportedVariableDeclaration["declarations"][number];

type MetaBinding = {
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
      };
    };
  } | null;
};

type SupportedTypeAnnotation = {
  typeAnnotation?: {
    type: string;
    start: number;
    typeArguments?: unknown;
    typeName?: {
      type: string;
      name?: string;
    };
  };
};

export type CmxBundleMetaExportExtraction =
  | {
      result: "none";
    }
  | {
      result: "present";
    }
  | {
      result: "unsupported";
      position: number;
    };

export function extractCmxBundleMetaExport(
  source: string,
  id: string,
): CmxBundleMetaExportExtraction {
  const metaSource = authoredEntrySourceForMeta(id, source);
  const parsed = parseSync(id, metaSource, {
    range: true,
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    return { result: "none" };
  }

  return exportedMetaBinding(parsed.program);
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

function exportedMetaBinding(program: Program): CmxBundleMetaExportExtraction {
  for (const statement of program.body) {
    if (
      statement.type !== "ExportNamedDeclaration" ||
      !statement.declaration ||
      statement.declaration.type !== "VariableDeclaration"
    ) {
      continue;
    }

    for (const declaration of statement.declaration.declarations) {
      const result = parseMetaBinding(declaration);
      if (result.result !== "none") {
        return result;
      }
    }
  }
  return { result: "none" };
}

function parseMetaBinding(
  declaration: VariableDeclarator,
): CmxBundleMetaExportExtraction {
  const binding: unknown = declaration.id;
  if (!isMetaBinding(binding)) {
    return { result: "none" };
  }

  const typeAnnotation = binding.typeAnnotation?.typeAnnotation;
  if (!typeAnnotation) {
    return { result: "present" };
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

  return { result: "present" };
}

function isMetaBinding(value: unknown): value is MetaBinding {
  return (
    isRecord(value) &&
    value.type === "Identifier" &&
    value.name === "meta" &&
    (value.typeAnnotation === undefined ||
      value.typeAnnotation === null ||
      isSupportedTypeAnnotation(value.typeAnnotation))
  );
}

function isSupportedTypeAnnotation(
  value: unknown,
): value is SupportedTypeAnnotation {
  return isRecord(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
