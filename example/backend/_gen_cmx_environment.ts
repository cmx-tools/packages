import type { Meta } from "@example/backend-contract";
import type { CmxEnvironment } from "cmx-contracts";
import type * as BackendContract from "@example/backend-contract";
import * as BackendApi from "./api.js";
import * as ExampleUiLibrary from "@example/ui-library";

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
    "@example/backend-contract": BackendApi satisfies typeof BackendContract,
    "@example/ui-library": ExampleUiLibrary,
  },
  metaType: {
    from: "@example/backend-contract",
    import: "Meta",
  },
};
