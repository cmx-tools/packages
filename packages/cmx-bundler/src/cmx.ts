import type { InputOptions, Plugin } from "rolldown";
import { parseSync, Visitor } from "rolldown/utils";
import { CMX_BUNDLE_FILE_NAME, type CmxTypeRef } from "cmx-contracts";
import {
  createCmxBundleArtifact,
  createEntryOrder,
  isEntryModule,
} from "./createCmxBundleArtifact.js";
import { createCmxExternalPolicy } from "./CmxExternalPolicy.js";
import {
  createExternalStubSource,
  externalStubIdFromSource,
  transformExternalImports,
  VIRTUAL_EXTERNAL_STUB_PREFIX,
  type ExternalStub,
} from "./createExternalImportStubs.js";
import { extractCmxBundleMetaType } from "./extractCmxBundleMetaType.js";
import { findUnsupportedExternalImport } from "./findUnsupportedExternalImport.js";
import { normalizeModulePath } from "./normalizeModulePath.js";

const RUNTIME_IMPORT_SOURCE = "cmx-runtime";
const DYNAMIC_IMPORT_UNSUPPORTED = "dynamic-import-unsupported";
const META_TYPE_UNSUPPORTED = "meta-type-unsupported";
const META_TYPE_UNSUPPORTED_MESSAGE =
  "CMX meta.type could not be extracted. Use a simple type-only import from an external package for exported meta annotations.";

export type UnsupportedMetaTypesPolicy = "error" | "omit";

export type CmxPluginOptions = {
  externals?: string[];
  unsupportedMetaTypes?: UnsupportedMetaTypesPolicy;
};

export function cmx(options: CmxPluginOptions = {}): Plugin {
  const jsxRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-runtime`;
  const jsxDevRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-dev-runtime`;
  const externalPolicy = createCmxExternalPolicy(options.externals ?? []);
  const unsupportedMetaTypes = options.unsupportedMetaTypes ?? "error";
  const externalStubs = new Map<string, ExternalStub>();
  const metaTypesByModuleId = new Map<string, CmxTypeRef>();
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

      return externalStubIdFromSource(source);
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

      return createExternalStubSource(RUNTIME_IMPORT_SOURCE, stub);
    },
    transform(source, id) {
      const moduleId = normalizeModulePath(id);
      if (isEntryModule(moduleId, entryOrder)) {
        const metaType = extractCmxBundleMetaType(source, id);
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
        externalPolicy,
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
        externalPolicy,
        externalStubs,
      );
    },
    generateBundle(_outputOptions, outputBundle) {
      const cmxBundle = createCmxBundleArtifact({
        outputBundle,
        entryOrder,
        runtimeImportSource: RUNTIME_IMPORT_SOURCE,
        metaTypesByModuleId,
      });

      this.emitFile({
        type: "asset",
        fileName: CMX_BUNDLE_FILE_NAME,
        source: `${JSON.stringify(cmxBundle, null, 2)}\n`,
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
