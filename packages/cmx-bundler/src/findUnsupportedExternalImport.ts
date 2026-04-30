import { ImportNameKind, parseSync } from "oxc-parser";
import type { CmxExternalPolicy } from "./CmxExternalPolicy.js";
import { matchesCmxExternalPolicy } from "./CmxExternalPolicy.js";

type UnsupportedExternalImport = {
  code: string;
  message: string;
  position: number;
};

type ExternalBinding = {
  start: number;
};

type AstNode = {
  type: string;
  start?: number;
  [key: string]: unknown;
};

type Scope = Set<string>;

export function findUnsupportedExternalImport(
  source: string,
  id: string,
  externalPolicy: CmxExternalPolicy,
): UnsupportedExternalImport | undefined {
  if (externalPolicy.patterns.length === 0) {
    return undefined;
  }

  const parsed = parseSync(id, source, {
    range: true,
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    return undefined;
  }

  for (const externalImport of parsed.module.staticImports) {
    const from = externalImport.moduleRequest.value;
    if (!matchesCmxExternalPolicy(from, externalPolicy)) {
      continue;
    }

    if (externalImport.entries.length === 0) {
      return {
        code: "external-side-effect-import-unsupported",
        message:
          "Side-effect-only imports from configured externals are not supported.",
        position: externalImport.moduleRequest.start,
      };
    }

    for (const entry of externalImport.entries) {
      if (
        !entry.isType &&
        entry.importName.kind === ImportNameKind.NamespaceObject
      ) {
        return {
          code: "external-namespace-import-unsupported",
          message:
            "Namespace imports from configured externals are not supported.",
          position: entry.localName.start,
        };
      }
    }
  }

  const externalBindings = externalValueBindings(
    parsed.module.staticImports,
    externalPolicy,
  );
  if (externalBindings.size === 0) {
    return undefined;
  }

  return findUnsupportedRuntimeUsage(parsed.program, externalBindings);
}

function findUnsupportedRuntimeUsage(
  program: unknown,
  externalBindings: Map<string, ExternalBinding>,
): UnsupportedExternalImport | undefined {
  let unsupported: UnsupportedExternalImport | undefined;

  function scan(value: unknown, scopes: Scope[]): void {
    if (unsupported || !isAstNode(value)) {
      return;
    }

    switch (value.type) {
      case "Program":
        scanNodeList(value.body, scopes);
        return;
      case "ImportDeclaration":
      case "TSTypeAliasDeclaration":
      case "TSInterfaceDeclaration":
      case "TSTypeAnnotation":
      case "TSTypeParameterDeclaration":
      case "TSTypeParameterInstantiation":
        return;
      case "FunctionDeclaration":
        addBinding(value.id, currentScope(scopes));
        scanFunction(value, scopes);
        return;
      case "FunctionExpression":
      case "ArrowFunctionExpression":
        scanFunction(value, scopes);
        return;
      case "BlockStatement":
        scanBlock(value, scopes);
        return;
      case "VariableDeclaration":
        scanVariableDeclaration(value, scopes);
        return;
      case "CallExpression":
        scanCallExpression(value, scopes);
        return;
      case "Identifier":
        if (isExternalIdentifier(value, scopes, externalBindings)) {
          unsupported = {
            code: "external-runtime-value-unsupported",
            message:
              "Configured external imports cannot be used as runtime values.",
            position: value.start ?? 0,
          };
        }
        return;
      case "Property":
        scanProperty(value, scopes);
        return;
      case "MemberExpression":
        scan(value.object, scopes);
        if (value.computed === true) {
          scan(value.property, scopes);
        }
        return;
      case "JSXElement":
        scanJsxElement(value, scopes);
        return;
      case "JSXFragment":
        scanNodeList(value.children, scopes);
        return;
      case "JSXExpressionContainer":
        scan(value.expression, scopes);
        return;
      case "JSXAttribute":
        scan(value.value, scopes);
        return;
      case "JSXSpreadAttribute":
        scan(value.argument, scopes);
        return;
      case "TSAsExpression":
      case "TSSatisfiesExpression":
      case "TSNonNullExpression":
      case "TSTypeAssertion":
      case "TSInstantiationExpression":
        scan(value.expression, scopes);
        return;
    }

    for (const child of Object.values(value)) {
      if (unsupported) {
        return;
      }
      if (Array.isArray(child)) {
        scanNodeList(child, scopes);
      } else {
        scan(child, scopes);
      }
    }
  }

  scan(program, [new Set()]);
  return unsupported;

  function scanCallExpression(node: AstNode, scopes: Scope[]): void {
    const callee = node.callee;
    if (
      isAstNode(callee) &&
      callee.type === "Identifier" &&
      isExternalIdentifier(callee, scopes, externalBindings)
    ) {
      unsupported = {
        code: "external-component-call-unsupported",
        message:
          "Configured external imports must be rendered as JSX components.",
        position: callee.start ?? 0,
      };
      return;
    }

    scan(callee, scopes);
    scanNodeList(node.arguments, scopes);
  }

  function scanFunction(node: AstNode, scopes: Scope[]): void {
    const functionScope = new Set<string>();
    for (const param of toNodeList(node.params)) {
      scanPatternDefaults(param, scopes, scan);
      addPatternBindings(param, functionScope);
    }

    const nextScopes = [...scopes, functionScope];
    scan(node.body, nextScopes);
  }

  function scanBlock(node: AstNode, scopes: Scope[]): void {
    const blockScopes = [...scopes, new Set<string>()];
    scanNodeList(node.body, blockScopes);
  }

  function scanVariableDeclaration(node: AstNode, scopes: Scope[]): void {
    for (const declaration of toNodeList(node.declarations)) {
      scan(declaration.init, scopes);
      addPatternBindings(declaration.id, currentScope(scopes));
    }
  }

  function scanProperty(node: AstNode, scopes: Scope[]): void {
    if (node.computed === true) {
      scan(node.key, scopes);
    }
    scan(node.value, scopes);
  }

  function scanJsxElement(node: AstNode, scopes: Scope[]): void {
    const openingElement = node.openingElement;
    if (isAstNode(openingElement)) {
      scanNodeList(openingElement.attributes, scopes);
    }
    scanNodeList(node.children, scopes);
  }

  function scanNodeList(value: unknown, scopes: Scope[]): void {
    for (const item of toNodeList(value)) {
      scan(item, scopes);
      if (unsupported) {
        return;
      }
    }
  }
}

function isExternalIdentifier(
  node: AstNode,
  scopes: Scope[],
  externalBindings: Map<string, ExternalBinding>,
): boolean {
  if (typeof node.name !== "string") {
    return false;
  }

  const binding = externalBindings.get(node.name);
  if (!binding || binding.start === node.start) {
    return false;
  }

  return !scopes.some((scope) => scope.has(node.name as string));
}

function externalValueBindings(
  staticImports: Array<{
    moduleRequest: { value: string };
    entries: Array<{
      importName: { kind: ImportNameKind };
      localName: { value: string; start: number };
      isType: boolean;
    }>;
  }>,
  externalPolicy: CmxExternalPolicy,
): Map<string, ExternalBinding> {
  const bindings = new Map<string, ExternalBinding>();
  for (const externalImport of staticImports) {
    if (
      !matchesCmxExternalPolicy(
        externalImport.moduleRequest.value,
        externalPolicy,
      )
    ) {
      continue;
    }

    for (const entry of externalImport.entries) {
      if (
        entry.isType ||
        entry.importName.kind === ImportNameKind.NamespaceObject
      ) {
        continue;
      }
      bindings.set(entry.localName.value, {
        start: entry.localName.start,
      });
    }
  }

  return bindings;
}

function addPatternBindings(value: unknown, bindings: Scope): void {
  if (!isAstNode(value)) {
    return;
  }

  switch (value.type) {
    case "Identifier":
      addBinding(value, bindings);
      return;
    case "AssignmentPattern":
      addPatternBindings(value.left, bindings);
      return;
    case "RestElement":
      addPatternBindings(value.argument, bindings);
      return;
    case "ArrayPattern":
      for (const element of toNodeList(value.elements)) {
        addPatternBindings(element, bindings);
      }
      return;
    case "ObjectPattern":
      for (const property of toNodeList(value.properties)) {
        addPatternBindings(property, bindings);
      }
      return;
    case "Property":
      addPatternBindings(value.value, bindings);
      return;
  }
}

function scanPatternDefaults(
  value: unknown,
  scopes: Scope[],
  scan?: (value: unknown, scopes: Scope[]) => void,
): void {
  if (!isAstNode(value)) {
    return;
  }

  switch (value.type) {
    case "AssignmentPattern":
      scan?.(value.right, scopes);
      scanPatternDefaults(value.left, scopes, scan);
      return;
    case "RestElement":
      scanPatternDefaults(value.argument, scopes, scan);
      return;
    case "ArrayPattern":
      for (const element of toNodeList(value.elements)) {
        scanPatternDefaults(element, scopes, scan);
      }
      return;
    case "ObjectPattern":
      for (const property of toNodeList(value.properties)) {
        scanPatternDefaults(property, scopes, scan);
      }
      return;
    case "Property":
      scanPatternDefaults(value.value, scopes, scan);
      return;
  }
}

function addBinding(value: unknown, bindings: Scope): void {
  if (isAstNode(value) && value.type === "Identifier") {
    const name = value.name;
    if (typeof name === "string") {
      bindings.add(name);
    }
  }
}

function currentScope(scopes: Scope[]): Scope {
  return scopes[scopes.length - 1] ?? new Set();
}

function toNodeList(value: unknown): AstNode[] {
  return Array.isArray(value) ? value.filter(isAstNode) : [];
}

function isAstNode(value: unknown): value is AstNode {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type?: unknown }).type === "string"
  );
}
