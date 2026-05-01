import type { Meta } from "@example/backend-contract";
import type * as BackendContract from "@example/backend-contract";
import * as BackendApi from "./api.js";
import * as ExampleUiLibrary from "@example/ui-library";

type CmxDependency = {
  name: string;
  specifier: string;
  version: string;
  integrity?: string;
};

type CmxTypeRef = {
  from: string;
  import?: string;
};

type CmxEnvironment<Meta = unknown> = {
  dependencies: CmxDependency[];
  imports: Record<string, Record<string, unknown>>;
  metaType?: CmxTypeRef;
};

export const environment = {
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
} satisfies CmxEnvironment<Meta>;
