import type { InputOptions, OutputBundle, OutputChunk, Plugin } from "rolldown";
import type { Program, StaticImport, VariableDeclarator } from "oxc-parser";
import { ImportNameKind, parseSync, Visitor } from "oxc-parser";
import { readFileSync, realpathSync } from "node:fs";
import path from "node:path";
import {
  CMX_BUNDLE_FILE_NAME,
  CMX_BUNDLE_VERSION,
  type CmxBundle,
  type CmxBundleChunk,
  type CmxBundleMetaTypeRef,
} from "../cmx-bundle.js";
import { findUnsupportedExternalImport } from "./findUnsupportedExternalImport.js";

const RUNTIME_IMPORT_SOURCE = "cmx-runtime";
const DYNAMIC_IMPORT_UNSUPPORTED = "dynamic-import-unsupported";
const META_TYPE_UNSUPPORTED = "meta-type-unsupported";
const META_TYPE_UNSUPPORTED_MESSAGE =
  "CMX meta.type could not be extracted. Use a simple type-only import from an external package for exported meta annotations.";
const EXTERNAL_STUB_PREFIX = "cmx-external:";
const VIRTUAL_EXTERNAL_STUB_PREFIX = `\0${EXTERNAL_STUB_PREFIX}`;

export type UnsupportedMetaTypesPolicy = "error" | "omit";

export type CmxPluginOptions = {
  externals?: string[];
  unsupportedMetaTypes?: UnsupportedMetaTypesPolicy;
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

export function cmx(options: CmxPluginOptions = {}): Plugin {
  const jsxRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-runtime`;
  const jsxDevRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-dev-runtime`;
  const externalPatterns = normalizeExternals(options.externals ?? []);
  const unsupportedMetaTypes = options.unsupportedMetaTypes ?? "error";
  const externalStubs = new Map<string, ExternalStub>();
  const metaTypesByModuleId = new Map<string, CmxBundleMetaTypeRef>();
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
          message: "Dynamic imports are not supported in CMX bundles.",
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
      const moduleId = normalizeModulePath(id);
      if (isEntryModule(moduleId, entryOrder)) {
        const metaSource = authoredEntrySourceForMeta(id, source);
        const metaType = extractMetaType(metaSource, id);
        if (metaType.result === "resolved") {
          metaTypesByModuleId.set(moduleId, metaType.ref);
        } else {
          metaTypesByModuleId.delete(moduleId);
        }
        if (
          metaType.result === "unsupported" &&
          unsupportedMetaTypes === "error"
        ) {
          this.error(
            {
              code: META_TYPE_UNSUPPORTED,
              message: META_TYPE_UNSUPPORTED_MESSAGE,
            },
            metaType.position,
          );
        }
      }

      const dynamicImport = findDynamicImport(source, id);
      if (dynamicImport) {
        this.error(
          {
            code: DYNAMIC_IMPORT_UNSUPPORTED,
            message: "Dynamic imports are not supported in CMX bundles.",
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
    generateBundle(_outputOptions, outputBundle) {
      const chunks = getOutputChunks(outputBundle);
      const bundleChunks = chunks.map(toBundleChunk);
      const cmxBundle: CmxBundle = {
        version: CMX_BUNDLE_VERSION,
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
            const bundleChunk = toBundleChunk(chunk);
            const metaType = chunk.facadeModuleId
              ? metaTypesByModuleId.get(
                  normalizeModulePath(chunk.facadeModuleId),
                )
              : undefined;
            return {
              name: chunk.name,
              file: bundleChunk.file,
              sourcemap: bundleChunk.sourcemap,
              ...(metaType ? { meta: { type: metaType } } : {}),
            };
          }),
        chunks: bundleChunks,
      };

      this.emitFile({
        type: "asset",
        fileName: CMX_BUNDLE_FILE_NAME,
        source: `${JSON.stringify(cmxBundle, null, 2)}\n`,
      });
    },
  };
}

function authoredEntrySourceForMeta(id: string, transformSource: string): string {
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

function normalizeModulePath(filePath: string): string {
  if (filePath.includes("\0")) {
    return filePath;
  }
  const resolved = path.resolve(filePath);
  try {
    return realpathSync(resolved);
  } catch {
    return resolved;
  }
}

function extractMetaType(source: string, id: string): MetaTypeExtraction {
  const parsed = parseSync(id, source, {
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

function importedTypeBindings(
  staticImports: StaticImport[],
): Map<string, CmxBundleMetaTypeRef> {
  const bindings = new Map<string, CmxBundleMetaTypeRef>();
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

type MetaTypeExtraction =
  | {
      result: "none";
    }
  | {
      result: "resolved";
      ref: CmxBundleMetaTypeRef;
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

function toBundleChunk(chunk: OutputChunk): CmxBundleChunk {
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
    entries.map((entry, index) => [
      normalizeModulePath(String(entry)),
      index,
    ]),
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
    entryOrder.get(normalizeModulePath(chunk.facadeModuleId)) ??
    Number.MAX_SAFE_INTEGER
  );
}

function isEntryModule(moduleId: string, entryOrder: Map<string, number>) {
  return entryOrder.has(moduleId);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
