import type { InputOptions, OutputBundle, OutputChunk, Plugin } from "rolldown";
import { parseSync, Visitor } from "oxc-parser";

const ARTIFACT_FILE_NAME = "cmx-artifact.json";
const RUNTIME_IMPORT_SOURCE = "@cmx/runtime";
const DYNAMIC_IMPORT_UNSUPPORTED = "dynamic-import-unsupported";

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

export function cmx(): Plugin {
  const jsxRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-runtime`;
  const jsxDevRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-dev-runtime`;

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

      return null;
    },
    transform(source, id) {
      const dynamicImport = findDynamicImport(source, id);
      if (!dynamicImport) {
        return null;
      }

      this.error(
        {
          code: DYNAMIC_IMPORT_UNSUPPORTED,
          message: "Dynamic imports are not supported in CMX artifacts.",
        },
        dynamicImport.position,
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
