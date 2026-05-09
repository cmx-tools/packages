import { describe, expect, it } from "vitest";
import type { CmxConfig } from "./index.js";

describe("CmxConfig", () => {
  it("supports CMX-owned keys", () => {
    const config: CmxConfig = {
      exports: {
        default: {
          required: true,
          type: {
            from: "cmx-contracts",
            import: "CmxNode",
          },
        },
      },
      externals: ["@pkg/ui"],
      unsupportedValues: "error",
      unverifiedOptionalExports: "omit",
    };

    expect(config.unsupportedValues).toBe("error");
    expect(config.unverifiedOptionalExports).toBe("omit");
  });
});
