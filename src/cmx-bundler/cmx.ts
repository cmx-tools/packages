import type { InputOptions, OutputBundle, OutputChunk, Plugin } from "rolldown";
import { ImportNameKind, parseSync, Visitor } from "oxc-parser";

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
  file: string;
  sourcemap: string;
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

export function cmx(options: CmxPluginOptions = {}): Plugin {
  const jsxRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-runtime`;
  const jsxDevRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-dev-runtime`;
  const externalPatterns = normalizeExternals(options.externals ?? []);
  const externalStubs = new Map<string, ExternalStub>();

  return {
    name: "cmx",
    options(inputOptions) {
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
        entries: artifactChunks
          .filter((chunk) => chunk.isEntry)
          .map(({ file, sourcemap }) => ({ file, sourcemap })),
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
