import { readFileSync } from "node:fs";
import type { TransformPluginContext } from "rolldown";
import type { CmxDependency } from "cmx-contracts";
import {
  findConsumerDependencySpecifier,
  type ConsumerPackageJson,
} from "./consumerPackage.js";

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
  context: TransformPluginContext,
  input: {
    importSpecifier: string;
    importerId: string;
    consumerPackageJsonPath: string;
    consumerPackage: ConsumerPackageJson;
    bundleDependencies: Map<string, CmxDependency>;
    getIntegrity?: CmxGetIntegrity;
  },
): Promise<void> {
  const resolved = await context.resolve(
    input.importSpecifier,
    input.importerId,
    {
      skipSelf: true,
    },
  );

  if (!resolved) {
    context.error({
      code: "cmx-external-resolve-failed",
      message: `CMX could not resolve external import ${JSON.stringify(input.importSpecifier)}.`,
    });
    return;
  }

  if (resolved.external) {
    context.error({
      code: "cmx-bundler-external-conflict",
      message: `CMX external ${JSON.stringify(input.importSpecifier)} is also marked as a Rolldown external. Use CMX "externals" for CMX externals; do not list the same module in Rolldown input.external.`,
    });
    return;
  }

  if (!resolved.packageJsonPath) {
    context.error({
      code: "cmx-external-missing-package-json",
      message: `CMX could not determine a package for external import ${JSON.stringify(input.importSpecifier)}.`,
    });
    return;
  }

  const packageSource = readFileSync(resolved.packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageSource) as {
    name?: unknown;
    version?: unknown;
  };
  if (typeof packageJson.name !== "string" || packageJson.name.length === 0) {
    context.error({
      code: "cmx-external-invalid-package-name",
      message: `Invalid package name in ${resolved.packageJsonPath}.`,
    });
    return;
  }
  if (
    typeof packageJson.version !== "string" ||
    packageJson.version.length === 0
  ) {
    context.error({
      code: "cmx-external-invalid-package-version",
      message: `Invalid version in ${resolved.packageJsonPath}.`,
    });
    return;
  }

  const packageName = packageJson.name;
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
      resolvedId: resolved.id,
      packageJsonPath: resolved.packageJsonPath,
      packageName,
      packageVersion: packageJson.version,
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
    version: packageJson.version,
    ...(integrity === undefined ? {} : { integrity }),
  };
  input.bundleDependencies.set(packageName, next);
}
