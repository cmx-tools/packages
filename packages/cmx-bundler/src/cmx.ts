import path from "node:path";
import type { InputOptions, Plugin, TransformPluginContext } from "rolldown";
import { parseSync, Visitor } from "rolldown/utils";
import type { CmxDependency, CmxTypeRef } from "cmx-contracts";
import { CMX_BUNDLE_FILE_NAME } from "cmx-contracts";
import {
  createCmxBundleArtifact,
  createEntryOrder,
  isEntryModule,
} from "./createCmxBundleArtifact.js";
import { readConsumerPackageJson } from "./consumerPackage.js";
import {
  createCmxExternalPolicy,
  matchesCmxExternalPolicy,
  type CmxExternalEntry,
} from "./CmxExternalPolicy.js";
import {
  createExternalStubSource,
  externalStubIdFromSource,
  transformExternalImports,
  VIRTUAL_EXTERNAL_STUB_PREFIX,
  type ExternalStub,
} from "./createExternalImportStubs.js";
import { extractCmxBundleMetaExport } from "./extractCmxBundleMetaExport.js";
import { findUnsupportedExternalImport } from "./findUnsupportedExternalImport.js";
import { normalizeModulePath } from "./normalizeModulePath.js";
import {
  resolveAndRecordCmxExternalDependency,
  type CmxGetIntegrity,
  type CmxIntegrityContext,
} from "./resolveCmxExternalDependency.js";

const RUNTIME_IMPORT_SOURCE = "cmx-runtime";
const DYNAMIC_IMPORT_UNSUPPORTED = "dynamic-import-unsupported";
const META_TYPE_UNSUPPORTED = "meta-type-unsupported";
const META_TYPE_UNSUPPORTED_MESSAGE =
  "CMX meta annotations must be simple non-generic type references.";
const META_REQUIRED = "cmx-meta-required";

export type CmxPluginMetaType = CmxTypeRef & {
  optional?: boolean;
};

export type CmxPluginOptions = {
  externals?: CmxExternalEntry[];
  metaType?: CmxPluginMetaType;
  cwd?: string;
  getIntegrity?: CmxGetIntegrity;
};

export type { CmxGetIntegrity, CmxIntegrityContext };
export type { CmxExternalEntry };

export function cmx(options: CmxPluginOptions = {}): Plugin {
  const jsxRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-runtime`;
  const jsxDevRuntimeModuleId = `${RUNTIME_IMPORT_SOURCE}/jsx-dev-runtime`;
  const externalPolicy = createCmxExternalPolicy(options.externals ?? []);
  const configuredMetaType = options.metaType
    ? toCmxTypeRef(options.metaType)
    : undefined;
  const externalStubs = new Map<string, ExternalStub>();
  const metaTypesByModuleId = new Map<string, CmxTypeRef>();
  const bundleDependencies = new Map<string, CmxDependency>();
  let entryOrder = new Map<string, number>();
  let consumerPackageJsonPathResolved!: string;
  let consumerPackage!: ReturnType<typeof readConsumerPackageJson>;

  return {
    name: "cmx",
    options(inputOptions) {
      entryOrder = createEntryOrder(inputOptions.input);
      return withCmxJsxRuntime(inputOptions);
    },
    buildStart() {
      bundleDependencies.clear();
      consumerPackageJsonPathResolved = path.resolve(
        path.join(options.cwd ?? process.cwd(), "package.json"),
      );
      try {
        consumerPackage = readConsumerPackageJson(
          consumerPackageJsonPathResolved,
        );
      } catch {
        this.error({
          code: "cmx-consumer-package-missing",
          message: `Could not read consumer package.json at ${consumerPackageJsonPathResolved}.`,
        });
      }
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
    async transform(source, id) {
      const moduleId = normalizeModulePath(id);
      if (isEntryModule(moduleId, entryOrder)) {
        const metaExport = extractCmxBundleMetaExport(source, id);
        if (metaExport.result === "present" && configuredMetaType) {
          metaTypesByModuleId.set(moduleId, configuredMetaType);
          if (
            matchesCmxExternalPolicy(configuredMetaType.from, externalPolicy)
          ) {
            await resolveAndRecordCmxExternalDependency(this, {
              importSpecifier: configuredMetaType.from,
              importerId: id,
              consumerPackageJsonPath: consumerPackageJsonPathResolved,
              consumerPackage,
              bundleDependencies,
              getIntegrity: options.getIntegrity,
            });
          }
        } else {
          metaTypesByModuleId.delete(moduleId);
        }
        if (metaExport.result === "unsupported") {
          this.error(
            {
              code: META_TYPE_UNSUPPORTED,
              message: META_TYPE_UNSUPPORTED_MESSAGE,
            },
            metaExport.position,
          );
        }
        if (
          metaExport.result === "none" &&
          configuredMetaType &&
          options.metaType?.optional !== true
        ) {
          this.error({
            code: META_REQUIRED,
            message:
              "CMX entry must export meta because cmx metaType is required.",
          });
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

      const resolveRecorder =
        externalPolicy.patterns.length > 0
          ? async (
              context: TransformPluginContext,
              importSpecifier: string,
              importerId: string,
            ) => {
              await resolveAndRecordCmxExternalDependency(context, {
                importSpecifier,
                importerId,
                consumerPackageJsonPath: consumerPackageJsonPathResolved,
                consumerPackage,
                bundleDependencies,
                getIntegrity: options.getIntegrity,
              });
            }
          : undefined;

      return transformExternalImports(
        this,
        source,
        id,
        externalPolicy,
        externalStubs,
        resolveRecorder,
      );
    },
    generateBundle(_outputOptions, outputBundle) {
      const cmxBundle = createCmxBundleArtifact({
        outputBundle,
        entryOrder,
        runtimeImportSource: RUNTIME_IMPORT_SOURCE,
        metaTypesByModuleId,
        dependencies: [...bundleDependencies.values()],
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

function toCmxTypeRef(metaType: CmxPluginMetaType): CmxTypeRef {
  return {
    from: metaType.from,
    ...(metaType.import === undefined ? {} : { import: metaType.import }),
  };
}
