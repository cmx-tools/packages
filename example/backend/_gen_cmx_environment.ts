import type { Meta } from "@example/backend-contract";
import type { CmxEnvironment } from "cmx-contracts";
import * as CmxEnvironmentImport0 from "./api.js";
import type * as CmxEnvironmentPublic0 from "@example/backend-contract";
import * as CmxEnvironmentImport1 from "@example/ui-library";

export const environment: CmxEnvironment<Meta> = {
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
    "@example/backend-contract":
      CmxEnvironmentImport0 satisfies typeof CmxEnvironmentPublic0,
    "@example/ui-library": CmxEnvironmentImport1,
  },
  metaType: {
    from: "@example/backend-contract",
    import: "Meta",
  },
};
