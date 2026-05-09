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

export type CmxContractConfig = {
  exports?: Record<string, CmxExportConfig>;
  externals?: CmxExternalEntry[];
  unsupportedValues?: UnsupportedValuesPolicy;
  unverifiedOptionalExports?: UnverifiedOptionalExportsPolicy;
  [key: string]: unknown;
};
