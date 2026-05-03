import path from "node:path";
import type {
  InputOptions,
  Plugin,
  PluginContext,
  TransformPluginContext,
} from "rolldown";
import { parseSync, Visitor } from "rolldown/utils";
import type { CmxDependency, CmxTypeRef } from "cmx-contracts";
import { CMX_BUNDLE_FILE_NAME } from "cmx-contracts";
import {
  createCmxBundleArtifact,
  createEntryOrder,
  isEntryModule,
} from "./createCmxBundleArtifact.js";
import { createCmxEnvironmentModuleSource } from "./createCmxEnvironmentModuleSource.js";
import { readConsumerPackageJson } from "./consumerPackage.js";
import {
  createCmxExternalPolicy,
  isExactImplementationExportMap,
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
import { discoverImplementationPackageExports } from "./discoverImplementationPackageExports.js";
import { extractCmxBundleMetaExport } from "./extractCmxBundleMetaExport.js";
import { findUnsupportedExternalImport } from "./findUnsupportedExternalImport.js";
import { normalizeModulePath } from "./normalizeModulePath.js";
import {
  resolveAndRecordCmxExternalDependency,
  type CmxGetIntegrity,
  type CmxIntegrityContext,
} from "./resolveCmxExternalDependency.js";
import { resolveCmxExternalImports } from "./resolveCmxExternalImports.js";

const RUNTIME_IMPORT_SOURCE = "cmx-runtime";
const DYNAMIC_IMPORT_UNSUPPORTED = "dynamic-import-unsupported";
const META_TYPE_UNSUPPORTED = "meta-type-unsupported";
const META_TYPE_UNSUPPORTED_MESSAGE =
  "CMX meta annotations must be simple non-generic type references.";
const META_REQUIRED = "cmx-meta-required";
const EXTERNAL_CONTRACT_INVALID = "cmx-external-contract-invalid";
const EXTERNAL_IMPLEMENTATION_EXPORTS_COMPLEX =
  "cmx-external-implementation-exports-complex";

export type CmxPluginMetaType = CmxTypeRef & {
  optional?: boolean;
};

export type CmxPluginOptions = {
  externals?: CmxExternalEntry[];
  metaType?: CmxPluginMetaType;
  environment?: CmxEnvironmentEmission;
  cwd?: string;
  getIntegrity?: CmxGetIntegrity;
};

export type CmxEnvironmentEmission = {
  fileName: string;
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
  const environmentDependencies = new Map<string, CmxDependency>();
  let environmentEntries: CmxEnvironmentEntry[] = [];
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
      bundleDependencies.clear();
      environmentDependencies.clear();
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
      if (options.environment) {
        const environmentImporterId = path.join(
          path.dirname(consumerPackageJsonPathResolved),
          "__cmx_environment__.ts",
        );
        environmentEntries = await toEnvironmentEntries(
          this,
          options.externals ?? [],
          environmentImporterId,
        );
        for (const entry of environmentEntries) {
          const publicImportSpecifier = entry.contract;
          if (!hasPackageName(publicImportSpecifier)) {
            continue;
          }
          await resolveAndRecordCmxExternalDependency(this, {
            importSpecifier: publicImportSpecifier,
            importerId: environmentImporterId,
            consumerPackageJsonPath: consumerPackageJsonPathResolved,
            consumerPackage,
            bundleDependencies: environmentDependencies,
            getIntegrity: options.getIntegrity,
          });
        }
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
        metaTypesByModuleId,
        dependencies: [...bundleDependencies.values()],
      });

      this.emitFile({
        type: "asset",
        fileName: CMX_BUNDLE_FILE_NAME,
        source: `${JSON.stringify(cmxBundle, null, 2)}\n`,
      });

      if (options.environment) {
        this.emitFile({
          type: "asset",
          fileName: options.environment.fileName,
          source: createCmxEnvironmentModuleSource({
            entries: environmentEntries,
            dependencies: [...environmentDependencies.values()],
            metaType: configuredMetaType,
          }),
        });
      }
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

type CmxEnvironmentEntry = {
  contract: string;
  implementation?: string;
};

async function toEnvironmentEntries(
  context: PluginContext,
  externals: CmxExternalEntry[],
  importerId: string,
): Promise<CmxEnvironmentEntry[]> {
  const entries: CmxEnvironmentEntry[] = [];

  for (const entry of externals) {
    if (typeof entry === "string") {
      entries.push(
        ...(await toEnvironmentEntriesForStringImplementation(
          context,
          entry,
          entry,
          importerId,
        )),
      );
      continue;
    }

    if (
      typeof entry.contract === "string" &&
      typeof entry.implementation === "string"
    ) {
      entries.push(
        ...(await toEnvironmentEntriesForStringImplementation(
          context,
          entry.contract,
          entry.implementation,
          importerId,
        )),
      );
      continue;
    }

    if (
      typeof entry.contract === "string" &&
      isExactImplementationExportMap(entry.implementation)
    ) {
      entries.push(
        ...Object.entries(entry.implementation).map(
          ([subpath, implementation]) =>
            toEnvironmentEntry(
              contractImportSpecifier(entry.contract, subpath),
              implementation,
            ),
        ),
      );
    }
  }

  return entries.filter((entry) => entry.contract.trim().length > 0);
}

async function toEnvironmentEntriesForStringImplementation(
  context: PluginContext,
  contract: string,
  implementation: string,
  importerId: string,
): Promise<CmxEnvironmentEntry[]> {
  const discovered = await discoverImplementationPackageExports(context, {
    implementation,
    importerId,
  });

  if (discovered.kind === "complex") {
    context.error({
      code: EXTERNAL_IMPLEMENTATION_EXPORTS_COMPLEX,
      message: `CMX cannot derive environment imports from complex exports for implementation ${JSON.stringify(implementation)}. Use an exact implementation export map instead.`,
    });
    return [];
  }

  if (discovered.kind === "rootOnly") {
    return [toEnvironmentEntry(contract, implementation)];
  }

  return discovered.subpaths.map((subpath) =>
    toEnvironmentEntry(
      contractImportSpecifier(contract, subpath),
      implementationImportSpecifier(implementation, subpath),
    ),
  );
}

function toEnvironmentEntry(
  contract: string,
  implementation: string,
): {
  contract: string;
  implementation?: string;
} {
  return implementation === contract
    ? { contract }
    : { contract, implementation };
}

function contractImportSpecifier(contract: string, subpath: string): string {
  return subpath === "." ? contract : `${contract}/${subpath.slice(2)}`;
}

function implementationImportSpecifier(
  implementation: string,
  subpath: string,
): string {
  return subpath === "."
    ? implementation
    : `${implementation}/${subpath.slice(2)}`;
}

function hasPackageName(importSpecifier: string): boolean {
  if (importSpecifier.startsWith(".") || path.isAbsolute(importSpecifier)) {
    return false;
  }

  const parts = importSpecifier.split("/");
  return importSpecifier.startsWith("@") ? parts.length >= 2 : parts[0] !== "";
}
