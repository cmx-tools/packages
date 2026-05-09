import type {
  CmxExportConfig,
  UnsupportedValuesPolicy,
  UnverifiedOptionalExportsPolicy,
} from "./cmxBundle.js";

export type CmxExactImplementationExportMap = Record<string, string>;

export type CmxExternalEntry = string | CmxStructuredExternalEntry;

export type CmxStructuredExternalEntry = {
  contract: string;
  implementation: string | CmxExactImplementationExportMap;
};

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

export type CmxConfig = {
  cwd?: string;
  exports?: Record<string, CmxExportConfig>;
  externals?: CmxExternalEntry[];
  unsupportedValues?: UnsupportedValuesPolicy;
  unverifiedOptionalExports?: UnverifiedOptionalExportsPolicy;
  getIntegrity?: CmxGetIntegrity;
};
