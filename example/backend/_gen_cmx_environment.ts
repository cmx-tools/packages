import type { Meta } from "@example/backend-contract";
import type { CmxEnvironment } from "cmx-contracts";
import * as Api from "./api.js";
import type * as ExampleBackendContract from "@example/backend-contract";
import * as ExampleUiLibrary from "@example/ui-library";

export const environment: CmxEnvironment<Meta | undefined> = {
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
  metaType: {
    from: "@example/backend-contract",
    import: "Meta",
    optional: true,
  },
};
