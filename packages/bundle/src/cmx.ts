import path from "node:path";
import type { InputOptions, Plugin, TransformPluginContext } from "rolldown";
import { parseSync, Visitor } from "rolldown/utils";
import type {
  CmxConfig,
  CmxDependency,
  CmxTypeRef,
} from "@cmx-tools/contracts";
import { CMX_BUNDLE_FILE_NAME } from "@cmx-tools/contracts";
import {
  createCmxBundleArtifact,
  createEntryOrder,
} from "./createCmxBundleArtifact.js";
import { detectConfiguredExportTypeRefs } from "./detectConfiguredExportTypeRefs.js";
import { normalizeModulePath } from "./normalizeModulePath.js";
import { readConsumerPackageJson } from "./consumerPackage.js";
import { createCmxExternalPolicy } from "./CmxExternalPolicy.js";
import {
  createExternalStubSource,
  externalStubIdFromSource,
  transformExternalImports,
  VIRTUAL_EXTERNAL_STUB_PREFIX,
  type ExternalStub,
} from "./createExternalImportStubs.js";
import { findUnsupportedExternalImport } from "./findUnsupportedExternalImport.js";
import { resolveAndRecordCmxExternalDependency } from "./resolveCmxExternalDependency.js";
import { resolveCmxExternalImports } from "./resolveCmxExternalImports.js";

const RUNTIME_IMPORT_SOURCE = "@cmx-tools/runtime";
const JSX_RUNTIME_MODULE_ID = `${RUNTIME_IMPORT_SOURCE}/jsx-runtime`;
const JSX_DEV_RUNTIME_MODULE_ID = `${RUNTIME_IMPORT_SOURCE}/jsx-dev-runtime`;
const DYNAMIC_IMPORT_UNSUPPORTED = "dynamic-import-unsupported";
const EXPORTS_REQUIRED = "cmx-exports-required";
const EXTERNAL_CONTRACT_INVALID = "cmx-external-contract-invalid";

export function cmx(options: CmxConfig): Plugin {
  const externalPolicy = createCmxExternalPolicy(options.externals ?? []);
  const externalStubs = new Map<string, ExternalStub>();
  const bundleDependencies = new Map<string, CmxDependency>();
  const sourceExportTypesByEntry = new Map<
    string,
    Record<string, CmxTypeRef | undefined>
  >();
  let entryOrder = new Map<string, number>();
  let consumerPackageJsonPathResolved!: string;
  let consumerPackage!: ReturnType<typeof readConsumerPackageJson>;

  return {
    name: "cmx",
    options(inputOptions) {
      entryOrder = createEntryOrder(inputOptions.input);
      return withCmxJsxRuntime(inputOptions);
    },
    async buildStart() {
      if (Object.keys(options.exports ?? {}).length === 0) {
        this.error({
          code: EXPORTS_REQUIRED,
          message: "CMX plugin options must configure at least one export.",
        });
      }
      bundleDependencies.clear();
      sourceExportTypesByEntry.clear();
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
      if (externalPolicy.invalidContracts.length > 0) {
        this.error({
          code: EXTERNAL_CONTRACT_INVALID,
          message: `CMX external contracts must be exact package contracts. Invalid externals: ${externalPolicy.invalidContracts.map((contract) => JSON.stringify(contract)).join(", ")}.`,
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

      if (
        source === JSX_RUNTIME_MODULE_ID ||
        source === JSX_DEV_RUNTIME_MODULE_ID
      ) {
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

      const entryTypeRefs = detectConfiguredExportTypeRefs({
        source,
        id,
        exports: options.exports ?? {},
      });
      if (Object.keys(entryTypeRefs).length > 0) {
        sourceExportTypesByEntry.set(normalizeModulePath(id), entryTypeRefs);
      }

      const externalImports = await resolveCmxExternalImports(
        this,
        source,
        id,
        externalPolicy,
      );
      const unsupportedExternalImport = findUnsupportedExternalImport(
        source,
        id,
        externalImports,
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
        externalPolicy.contracts.length > 0
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
        externalImports,
        externalStubs,
        resolveRecorder,
      );
    },
    generateBundle(_outputOptions, outputBundle) {
      const cmxBundle = createCmxBundleArtifact({
        outputBundle,
        entryOrder,
        runtimeImportSource: RUNTIME_IMPORT_SOURCE,
        exports: options.exports ?? {},
        unsupportedValues: options.unsupportedValues ?? "error",
        unverifiedOptionalExports: options.unverifiedOptionalExports ?? "error",
        dependencies: [...bundleDependencies.values()],
        sourceExportTypesByEntry,
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
