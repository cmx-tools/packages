import type { CmxEnvironment } from "cmx-contracts";
import type { CmxNode as CmxContractsCmxnode } from "cmx-contracts";
import type { Meta as ExampleBackendContractMeta } from "@example/backend-contract";
import * as Api from "./api.js";
import type * as ExampleBackendContract from "@example/backend-contract";
import * as ExampleUiLibrary from "@example/ui-library";

type CmxEnvironmentExports = {
  default: CmxContractsCmxnode;
  meta?: ExampleBackendContractMeta;
};

export const environment: CmxEnvironment<CmxEnvironmentExports> = {
  dependencies: [
    {
      name: "@example/backend-contract",
      specifier: "workspace:*",
      version: "0.1.0",
    },
    {
      name: "@example/ui-library",
      specifier: "workspace:*",
      version: "0.1.0",
    },
  ],
  imports: {
    "@example/backend-contract": Api satisfies typeof ExampleBackendContract,
    "@example/ui-library": ExampleUiLibrary,
  },
};
