import type { InputOptions, OutputBundle, OutputChunk, Plugin } from "rolldown";
import type {
  CallExpression,
  Program,
  StaticImport,
  VariableDeclarator,
} from "oxc-parser";
import { ImportNameKind, parseSync, Visitor } from "oxc-parser";
import path from "node:path";

const ARTIFACT_FILE_NAME = "cmx-artifact.json";
const RUNTIME_IMPORT_SOURCE = "@cmx/runtime";
const DYNAMIC_IMPORT_UNSUPPORTED = "dynamic-import-unsupported";
const EXTERNAL_STUB_PREFIX = "cmx-external:";
const VIRTUAL_EXTERNAL_STUB_PREFIX = `\0${EXTERNAL_STUB_PREFIX}`;

export type CmxArtifactChunk = {
  file: string;
  sourcemap: string;
  isEntry: boolean;
};

export type CmxArtifactEntry = {
  name: string;
  file: string;
  sourcemap: string;
  meta?: CmxArtifactEntryMeta;
};

export type CmxArtifactEntryMeta = {
  type?: CmxArtifactMetaTypeRef;
};

export type CmxArtifactMetaTypeRef = {
  from: string;
  import?: string;
};

export type CmxArtifact = {
  runtime: {
    importSource: string;
  };
  entries: CmxArtifactEntry[];
  chunks: CmxArtifactChunk[];
};

export type CmxPluginOptions = {
  externals?: string[];
};

type ExternalStub = {
  from: string;
  hasDefault: boolean;
  namedImports: Set<string>;
};

type TypeAnnotatedMetaBinding = {
  type: "Identifier";
  name: "meta";
  typeAnnotation?: {
    typeAnnotation?: {
      type: string;
      typeArguments?: unknown;
      typeName?: {
        type: string;
        name?: string;
      };
    };
  };
};

export function cmx(options: CmxPluginOptions = {}): Plugin {
  const jsxRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-runtime`;
  const jsxDevRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-dev-runtime`;
  const externalPatterns = normalizeExternals(options.externals ?? []);
  const externalStubs = new Map<string, ExternalStub>();
  const metaTypesByModuleId = new Map<string, CmxArtifactMetaTypeRef>();
  let entryOrder = new Map<string, number>();

  return {
    name: "cmx",
    options(inputOptions) {
      entryOrder = createEntryOrder(inputOptions.input);
      return withCmxJsxRuntime(inputOptions);
    },
    outputOptions(outputOptions) {
      return {
        ...outputOptions,
        format: "esm",
        sourcemap: true,
      };
    },
    resolveId(source, _importer, extraOptions) {
      if (extraOptions.kind === "dynamic-import") {
        this.error({
          code: DYNAMIC_IMPORT_UNSUPPORTED,
          message: "Dynamic imports are not supported in CMX artifacts.",
        });
      }

      if (source === jsxRuntimeModuleId || source === jsxDevRuntimeModuleId) {
        return {
          id: source,
          external: true,
        };
      }

      if (source.startsWith(EXTERNAL_STUB_PREFIX)) {
        return `${VIRTUAL_EXTERNAL_STUB_PREFIX}${source.slice(EXTERNAL_STUB_PREFIX.length)}`;
      }

      return null;
    },
    load(id) {
      if (!id.startsWith(VIRTUAL_EXTERNAL_STUB_PREFIX)) {
        return null;
      }

      const publicId = id.slice(1);
      const stub = externalStubs.get(publicId);
      if (!stub) {
        return "export {};\n";
      }

      return createExternalStubSource(stub);
    },
    transform(source, id) {
      const metaType = extractMetaType(source, id);
      if (metaType) {
        metaTypesByModuleId.set(path.resolve(id), metaType);
      } else {
        metaTypesByModuleId.delete(path.resolve(id));
      }

      const dynamicImport = findDynamicImport(source, id);
      if (dynamicImport) {
        this.error(
          {
            code: DYNAMIC_IMPORT_UNSUPPORTED,
            message: "Dynamic imports are not supported in CMX artifacts.",
          },
          dynamicImport.position,
        );
      }

      const unsupportedExternalImport = findUnsupportedExternalImport(
        source,
        id,
        externalPatterns,
      );
      if (unsupportedExternalImport) {
        this.error(
          {
            code: unsupportedExternalImport.code,
            message: unsupportedExternalImport.message,
          },
          unsupportedExternalImport.position,
        );
      }

      return transformExternalImports(
        source,
        id,
        externalPatterns,
        externalStubs,
      );
    },
    generateBundle(_outputOptions, bundle) {
      const chunks = getOutputChunks(bundle);
      const artifactChunks = chunks.map(toArtifactChunk);
      const artifact: CmxArtifact = {
        runtime: {
          importSource: RUNTIME_IMPORT_SOURCE,
        },
        entries: chunks
          .filter((chunk) => chunk.isEntry)
          .sort(
            (a, b) =>
              entrySortIndex(a, entryOrder) - entrySortIndex(b, entryOrder),
          )
          .map((chunk) => {
            const artifactChunk = toArtifactChunk(chunk);
            const metaType = chunk.facadeModuleId
              ? metaTypesByModuleId.get(path.resolve(chunk.facadeModuleId))
              : undefined;
            return {
              name: chunk.name,
              file: artifactChunk.file,
              sourcemap: artifactChunk.sourcemap,
              ...(metaType ? { meta: { type: metaType } } : {}),
            };
          }),
        chunks: artifactChunks,
      };

      this.emitFile({
        type: "asset",
        fileName: ARTIFACT_FILE_NAME,
        source: `${JSON.stringify(artifact, null, 2)}\n`,
      });
    },
  };
}

function extractMetaType(
  source: string,
  id: string,
): CmxArtifactMetaTypeRef | undefined {
  const parsed = parseSync(id, source, {
    range: true,
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    return undefined;
  }

  const metaTypeName = exportedMetaTypeName(parsed.program);
  if (!metaTypeName) {
    return undefined;
  }

  return importedTypeBindings(parsed.module.staticImports).get(metaTypeName);
}

function importedTypeBindings(
  staticImports: StaticImport[],
): Map<string, CmxArtifactMetaTypeRef> {
  const bindings = new Map<string, CmxArtifactMetaTypeRef>();
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

function exportedMetaTypeName(program: Program): string | undefined {
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
      if (typeName) {
        return typeName;
      }
    }
  }
  return undefined;
}

function metaVariableTypeName(
  declaration: VariableDeclarator,
): string | undefined {
  const binding: unknown = declaration.id;
  if (!isTypeAnnotatedMetaBinding(binding)) {
    return undefined;
  }

  const typeAnnotation = binding.typeAnnotation?.typeAnnotation;
  if (
    !typeAnnotation ||
    typeAnnotation.type !== "TSTypeReference" ||
    typeAnnotation.typeArguments ||
    !typeAnnotation.typeName ||
    typeAnnotation.typeName.type !== "Identifier"
  ) {
    return undefined;
  }

  return typeAnnotation.typeName.name;
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

function findDynamicImport(
  source: string,
  id: string,
): { position: number } | undefined {
  const parsed = parseSync(id, source, {
    range: true,
    sourceType: "module",
  });
  if (parsed.errors.length > 0) {
    return undefined;
  }

  let position: number | undefined;
  const visitor = new Visitor({
    ImportExpression(node: { start: number }) {
      position = node.start;
    },
  });
  visitor.visit(parsed.program);

  return position === undefined ? undefined : { position };
}

function findUnsupportedExternalImport(
  source: string,
  id: string,
  externalPatterns: string[],
):
  | {
      code: string;
      message: string;
      position: number;
    }
  | undefined {
  if (externalPatterns.length === 0) {
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
    if (!matchesExternal(from, externalPatterns)) {
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
    externalPatterns,
  );
  if (externalBindings.size > 0) {
    const importBindingStarts = externalValueBindingStarts(
      parsed.module.staticImports,
      externalPatterns,
    );
    let externalCall:
      | {
          position: number;
        }
      | undefined;
    const visitor = new Visitor({
      CallExpression(node: CallExpression) {
        if (
          node.callee.type === "Identifier" &&
          typeof node.callee.name === "string" &&
          externalBindings.has(node.callee.name)
        ) {
          externalCall = {
            position: node.callee.start,
          };
        }
      },
    });
    visitor.visit(parsed.program);

    if (externalCall) {
      return {
        code: "external-component-call-unsupported",
        message:
          "Configured external imports must be rendered as JSX components.",
        position: externalCall.position,
      };
    }

    let externalRuntimeValue:
      | {
          position: number;
        }
      | undefined;
    const runtimeValueVisitor = new Visitor({
      Identifier(node) {
        if (
          typeof node.name === "string" &&
          externalBindings.has(node.name) &&
          !importBindingStarts.has(node.start)
        ) {
          externalRuntimeValue = {
            position: node.start,
          };
        }
      },
    });
    runtimeValueVisitor.visit(parsed.program);

    if (externalRuntimeValue) {
      return {
        code: "external-runtime-value-unsupported",
        message:
          "Configured external imports cannot be used as runtime values.",
        position: externalRuntimeValue.position,
      };
    }
  }

  return undefined;
}

function externalValueBindings(
  staticImports: Array<{
    moduleRequest: { value: string };
    entries: Array<{
      importName: { kind: ImportNameKind };
      localName: { value: string };
      isType: boolean;
    }>;
  }>,
  externalPatterns: string[],
): Set<string> {
  const bindings = new Set<string>();
  for (const externalImport of staticImports) {
    if (
      !matchesExternal(externalImport.moduleRequest.value, externalPatterns)
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
      bindings.add(entry.localName.value);
    }
  }

  return bindings;
}

function externalValueBindingStarts(
  staticImports: Array<{
    moduleRequest: { value: string };
    entries: Array<{
      importName: { kind: ImportNameKind };
      localName: { start: number };
      isType: boolean;
    }>;
  }>,
  externalPatterns: string[],
): Set<number> {
  const starts = new Set<number>();
  for (const externalImport of staticImports) {
    if (
      !matchesExternal(externalImport.moduleRequest.value, externalPatterns)
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
      starts.add(entry.localName.start);
    }
  }

  return starts;
}

function transformExternalImports(
  source: string,
  id: string,
  externalPatterns: string[],
  externalStubs: Map<string, ExternalStub>,
): { code: string; map: null } | null {
  if (externalPatterns.length === 0) {
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
    if (!matchesExternal(from, externalPatterns)) {
      continue;
    }

    const stub = externalStubFromImport(from, externalImport.entries);
    if (!stub) {
      continue;
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
    importName: { kind: ImportNameKind; name: string | null };
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

    if (entry.importName.kind === ImportNameKind.Default) {
      stub.hasDefault = true;
      continue;
    }

    if (entry.importName.kind === ImportNameKind.Name) {
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

function createExternalStubSource(stub: ExternalStub): string {
  const lines = [
    `import { __registerExternal } from ${JSON.stringify(`${RUNTIME_IMPORT_SOURCE}/jsx-runtime`)};`,
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

function normalizeExternals(externals: string[]): string[] {
  return externals
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0)
    .map((entry) => {
      if (entry.endsWith("/**")) {
        const base = entry.slice(0, -3).replace(/\/+$/u, "");
        return `${base}/**`;
      }
      if (entry.endsWith("/*")) {
        const base = entry.slice(0, -2).replace(/\/+$/u, "");
        return `${base}/*`;
      }
      return entry.replace(/\/+$/u, "");
    });
}

function matchesExternal(canonicalId: string, patterns: string[]): boolean {
  for (const pattern of patterns) {
    if (matchesExternalPattern(canonicalId, pattern)) {
      return true;
    }
  }
  return false;
}

function matchesExternalPattern(canonicalId: string, pattern: string): boolean {
  if (pattern.endsWith("/**")) {
    const base = pattern.slice(0, -3);
    return canonicalId === base || canonicalId.startsWith(`${base}/`);
  }

  if (pattern.endsWith("/*")) {
    const base = pattern.slice(0, -2);
    if (!canonicalId.startsWith(`${base}/`)) {
      return false;
    }

    const remainder = canonicalId.slice(base.length + 1);
    return remainder.length > 0 && !remainder.includes("/");
  }

  return pattern === canonicalId || canonicalId.startsWith(`${pattern}/`);
}

function withCmxJsxRuntime(inputOptions: InputOptions): InputOptions {
  const existingTransform = inputOptions.transform ?? {};
  const existingJsx =
    typeof existingTransform.jsx === "object" && existingTransform.jsx !== null
      ? existingTransform.jsx
      : {};

  return {
    ...inputOptions,
    transform: {
      ...existingTransform,
      jsx: {
        ...existingJsx,
        runtime: "automatic",
        importSource: RUNTIME_IMPORT_SOURCE,
      },
    },
  };
}

function getOutputChunks(bundle: OutputBundle): OutputChunk[] {
  return Object.values(bundle)
    .filter((item): item is OutputChunk => item.type === "chunk")
    .sort((a, b) => a.fileName.localeCompare(b.fileName));
}

function toArtifactChunk(chunk: OutputChunk): CmxArtifactChunk {
  if (!chunk.sourcemapFileName) {
    throw new Error(`Missing sourcemap for emitted chunk ${chunk.fileName}.`);
  }

  return {
    file: chunk.fileName,
    sourcemap: chunk.sourcemapFileName,
    isEntry: chunk.isEntry,
  };
}

function createEntryOrder(input: InputOptions["input"]): Map<string, number> {
  const entries =
    typeof input === "string"
      ? [input]
      : Array.isArray(input)
        ? input
        : input
          ? Object.values(input)
          : [];

  return new Map(
    entries.map((entry, index) => [path.resolve(String(entry)), index]),
  );
}

function entrySortIndex(
  chunk: OutputChunk,
  entryOrder: Map<string, number>,
): number {
  if (!chunk.facadeModuleId) {
    return Number.MAX_SAFE_INTEGER;
  }

  return (
    entryOrder.get(path.resolve(chunk.facadeModuleId)) ??
    Number.MAX_SAFE_INTEGER
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
