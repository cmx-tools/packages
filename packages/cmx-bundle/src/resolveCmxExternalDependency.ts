import type { PluginContext } from "rolldown";
import type { CmxDependency } from "cmx-contracts";
import {
  findConsumerDependencySpecifier,
  type ConsumerPackageJson,
} from "./consumerPackage.js";
import { resolveCmxPackageIdentity } from "./resolveCmxPackageIdentity.js";

export type CmxIntegrityContext = {
  importSpecifier: string;
  importerId: string;
  resolvedId: string;
  packageJsonPath: string;
  packageName: string;
  packageVersion: string;
  consumerPackageJsonPath: string;
  specifier: string;
};

export type CmxGetIntegrity = (context: CmxIntegrityContext) => string | null;

export async function resolveAndRecordCmxExternalDependency(
  context: PluginContext,
  input: {
    importSpecifier: string;
    importerId: string;
    consumerPackageJsonPath: string;
    consumerPackage: ConsumerPackageJson;
    bundleDependencies: Map<string, CmxDependency>;
    getIntegrity?: CmxGetIntegrity;
  },
): Promise<void> {
  const packageIdentity = await resolveCmxPackageIdentity(context, {
    importSpecifier: input.importSpecifier,
    importerId: input.importerId,
  });

  if (packageIdentity.result === "unresolved") {
    context.error({
      code: "cmx-external-resolve-failed",
      message: `CMX could not resolve external import ${JSON.stringify(input.importSpecifier)}.`,
    });
    return;
  }

  if (packageIdentity.result === "external") {
    context.error({
      code: "cmx-bundle-external-conflict",
      message: `CMX external ${JSON.stringify(input.importSpecifier)} is also marked as a Rolldown external. Use CMX "externals" for CMX externals; do not list the same module in Rolldown input.external.`,
    });
    return;
  }

  if (packageIdentity.result === "missing-package-json") {
    context.error({
      code: "cmx-external-missing-package-json",
      message: `CMX could not determine a package for external import ${JSON.stringify(input.importSpecifier)}.`,
    });
    return;
  }

  if (packageIdentity.result === "invalid-package-name") {
    context.error({
      code: "cmx-external-invalid-package-name",
      message: `Invalid package name in ${packageIdentity.packageJsonPath}.`,
    });
    return;
  }

  if (packageIdentity.result === "invalid-package-version") {
    context.error({
      code: "cmx-external-invalid-package-version",
      message: `Invalid version in ${packageIdentity.packageJsonPath}.`,
    });
    return;
  }

  const packageName = packageIdentity.packageName;
  const specifier = findConsumerDependencySpecifier(
    input.consumerPackage,
    packageName,
  );
  if (specifier === undefined) {
    context.error({
      code: "cmx-external-missing-consumer-dependency",
      message: `Package ${JSON.stringify(packageName)} must be listed in the consumer package.json (dependencies, devDependencies, peerDependencies, or optionalDependencies) for CMX external imports.`,
    });
    return;
  }

  let integrity: string | undefined;
  if (input.getIntegrity) {
    const fromCallback = input.getIntegrity({
      importSpecifier: input.importSpecifier,
      importerId: input.importerId,
      resolvedId: packageIdentity.resolvedId,
      packageJsonPath: packageIdentity.packageJsonPath,
      packageName,
      packageVersion: packageIdentity.packageVersion,
      consumerPackageJsonPath: input.consumerPackageJsonPath,
      specifier,
    });
    if (fromCallback !== null) {
      integrity = fromCallback;
    }
  }

  const next: CmxDependency = {
    name: packageName,
    specifier,
    version: packageIdentity.packageVersion,
    ...(integrity === undefined ? {} : { integrity }),
  };
  input.bundleDependencies.set(packageName, next);
}
