import { parseSync } from "rolldown/utils";
import type { CmxExportConfig, CmxTypeRef } from "cmx-contracts";

type AstNode = {
  type: string;
  [key: string]: unknown;
};

type ImportTypeRef = {
  from: string;
  imported?: string;
};

export function detectConfiguredExportTypeRefs(input: {
  source: string;
  id: string;
  exports: Record<string, CmxExportConfig>;
}): Record<string, CmxTypeRef | undefined> {
  const parsed = parseSync(input.id, input.source, {
    range: true,
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    return {};
  }
  const program = parsed.program as unknown as AstNode;

  const selected = new Set(Object.keys(input.exports));
  const importTypeRefs = collectImportTypeRefs(program);
  const localTypeAliases = collectLocalTypeAliases(program, importTypeRefs);
  const variableFacts = collectVariableTypeFacts(
    program,
    importTypeRefs,
    localTypeAliases,
  );

  const exportFacts: Record<string, CmxTypeRef | undefined> = {};

  for (const node of toNodeList(program.body)) {
    if (!isAstNode(node)) {
      continue;
    }

    if (node.type === "ExportNamedDeclaration") {
      if (node.exportKind === "type") {
        continue;
      }
      const declaration = node.declaration;
      if (
        isAstNode(declaration) &&
        declaration.type === "VariableDeclaration"
      ) {
        for (const declarator of toNodeList(declaration.declarations)) {
          const name = identifierName(declarator?.id);
          if (!name || !selected.has(name)) {
            continue;
          }
          const typeRef = detectDeclaratorTypeRef(
            declarator,
            importTypeRefs,
            localTypeAliases,
            variableFacts,
          );
          exportFacts[name] = typeRef;
        }
      }
      if (
        isAstNode(declaration) &&
        declaration.type === "FunctionDeclaration"
      ) {
        const name = identifierName(declaration.id);
        if (name && selected.has(name)) {
          exportFacts[name] = typeRefFromReturnType(
            declaration.returnType,
            importTypeRefs,
            localTypeAliases,
          );
        }
      }
      continue;
    }

    if (node.type === "ExportDefaultDeclaration" && selected.has("default")) {
      exportFacts.default = detectDefaultExportTypeRef(
        node.declaration,
        importTypeRefs,
        localTypeAliases,
        variableFacts,
      );
    }
  }

  return exportFacts;
}

function detectDefaultExportTypeRef(
  declaration: unknown,
  importTypeRefs: Map<string, ImportTypeRef>,
  localTypeAliases: Map<string, CmxTypeRef>,
  variableFacts: Map<string, CmxTypeRef>,
): CmxTypeRef | undefined {
  if (!isAstNode(declaration)) {
    return undefined;
  }

  if (declaration.type === "FunctionDeclaration") {
    return typeRefFromReturnType(
      declaration.returnType,
      importTypeRefs,
      localTypeAliases,
    );
  }

  if (declaration.type === "Identifier") {
    const name = identifierName(declaration);
    return name === undefined ? undefined : variableFacts.get(name);
  }

  if (declaration.type === "TSSatisfiesExpression") {
    return typeRefFromTypeNode(
      declaration.typeAnnotation,
      importTypeRefs,
      localTypeAliases,
    );
  }

  return undefined;
}

function collectImportTypeRefs(program: AstNode): Map<string, ImportTypeRef> {
  const refs = new Map<string, ImportTypeRef>();

  for (const node of toNodeList(program.body)) {
    if (!isAstNode(node) || node.type !== "ImportDeclaration") {
      continue;
    }

    const source = literalString(node.source);
    if (!source) {
      continue;
    }

    const importKind =
      typeof node.importKind === "string" ? node.importKind : "value";
    for (const specifier of toNodeList(node.specifiers)) {
      if (!isAstNode(specifier)) {
        continue;
      }
      const local = identifierName(specifier.local);
      if (!local) {
        continue;
      }

      const specifierKind =
        typeof specifier.importKind === "string"
          ? specifier.importKind
          : importKind;
      if (specifierKind !== "type" && importKind !== "type") {
        continue;
      }

      if (specifier.type !== "ImportSpecifier") {
        continue;
      }

      const imported = identifierName(specifier.imported) ?? local;
      refs.set(local, {
        from: source,
        ...(imported === "default" ? {} : { imported }),
      });
    }
  }

  return refs;
}

function collectLocalTypeAliases(
  program: AstNode,
  importTypeRefs: Map<string, ImportTypeRef>,
): Map<string, CmxTypeRef> {
  const aliases = new Map<string, CmxTypeRef>();

  for (const node of toNodeList(program.body)) {
    if (!isAstNode(node) || node.type !== "TSTypeAliasDeclaration") {
      continue;
    }

    const name = identifierName(node.id);
    if (!name) {
      continue;
    }

    const typeRef = typeRefFromTypeNode(
      node.typeAnnotation,
      importTypeRefs,
      aliases,
    );
    if (typeRef) {
      aliases.set(name, typeRef);
    }
  }

  return aliases;
}

function collectVariableTypeFacts(
  program: AstNode,
  importTypeRefs: Map<string, ImportTypeRef>,
  localTypeAliases: Map<string, CmxTypeRef>,
): Map<string, CmxTypeRef> {
  const variableFacts = new Map<string, CmxTypeRef>();

  for (const node of toNodeList(program.body)) {
    if (!isAstNode(node) || node.type !== "VariableDeclaration") {
      continue;
    }

    for (const declarator of toNodeList(node.declarations)) {
      const name = identifierName(declarator?.id);
      if (!name) {
        continue;
      }
      const typeRef = detectDeclaratorTypeRef(
        declarator,
        importTypeRefs,
        localTypeAliases,
        variableFacts,
      );
      if (typeRef) {
        variableFacts.set(name, typeRef);
      }
    }
  }

  return variableFacts;
}

function detectDeclaratorTypeRef(
  declarator: unknown,
  importTypeRefs: Map<string, ImportTypeRef>,
  localTypeAliases: Map<string, CmxTypeRef>,
  variableFacts: Map<string, CmxTypeRef>,
): CmxTypeRef | undefined {
  if (!isAstNode(declarator)) {
    return undefined;
  }

  const idTypeRef = typeRefFromTypeAnnotation(
    declarator.id,
    importTypeRefs,
    localTypeAliases,
  );
  if (idTypeRef) {
    return idTypeRef;
  }

  const init = declarator.init;
  if (!isAstNode(init)) {
    return undefined;
  }

  if (
    init.type === "ArrowFunctionExpression" ||
    init.type === "FunctionExpression"
  ) {
    return typeRefFromReturnType(
      init.returnType,
      importTypeRefs,
      localTypeAliases,
    );
  }

  if (init.type === "TSSatisfiesExpression") {
    return typeRefFromTypeNode(
      init.typeAnnotation,
      importTypeRefs,
      localTypeAliases,
    );
  }

  if (init.type === "Identifier") {
    const name = identifierName(init);
    return name === undefined ? undefined : variableFacts.get(name);
  }

  return undefined;
}

function typeRefFromTypeAnnotation(
  node: unknown,
  importTypeRefs: Map<string, ImportTypeRef>,
  localTypeAliases: Map<string, CmxTypeRef>,
): CmxTypeRef | undefined {
  if (!isAstNode(node) || !isAstNode(node.typeAnnotation)) {
    return undefined;
  }

  const annotation = node.typeAnnotation;
  if (annotation.type !== "TSTypeAnnotation") {
    return undefined;
  }

  return typeRefFromTypeNode(
    annotation.typeAnnotation,
    importTypeRefs,
    localTypeAliases,
  );
}

function typeRefFromReturnType(
  returnType: unknown,
  importTypeRefs: Map<string, ImportTypeRef>,
  localTypeAliases: Map<string, CmxTypeRef>,
): CmxTypeRef | undefined {
  if (!isAstNode(returnType) || returnType.type !== "TSTypeAnnotation") {
    return undefined;
  }

  return typeRefFromTypeNode(
    returnType.typeAnnotation,
    importTypeRefs,
    localTypeAliases,
  );
}

function typeRefFromTypeNode(
  node: unknown,
  importTypeRefs: Map<string, ImportTypeRef>,
  localTypeAliases: Map<string, CmxTypeRef>,
): CmxTypeRef | undefined {
  if (!isAstNode(node) || node.type !== "TSTypeReference") {
    return undefined;
  }

  if (node.typeArguments !== null && node.typeArguments !== undefined) {
    return undefined;
  }

  const typeName = node.typeName;
  if (!isAstNode(typeName) || typeName.type !== "Identifier") {
    return undefined;
  }

  const typeNameValue = identifierName(typeName);
  if (!typeNameValue) {
    return undefined;
  }

  const fromImport = importTypeRefs.get(typeNameValue);
  if (fromImport) {
    return {
      from: fromImport.from,
      ...(fromImport.imported === undefined || fromImport.imported === "default"
        ? {}
        : { import: fromImport.imported }),
    };
  }

  return localTypeAliases.get(typeNameValue);
}

function identifierName(node: unknown): string | undefined {
  if (!isAstNode(node) || node.type !== "Identifier") {
    return undefined;
  }

  return typeof node.name === "string" ? node.name : undefined;
}

function literalString(node: unknown): string | undefined {
  if (!isAstNode(node) || node.type !== "Literal") {
    return undefined;
  }

  return typeof node.value === "string" ? node.value : undefined;
}

function toNodeList(value: unknown): AstNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isAstNode);
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
