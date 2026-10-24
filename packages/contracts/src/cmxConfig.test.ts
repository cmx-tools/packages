import { describe, expect, it } from "vitest";
import type { CmxConfig } from "./index.js";

describe("CmxConfig", () => {
  it("supports CMX-owned keys", () => {
    const config: CmxConfig = {
      dangerouslyAllowInnerHtml: true,
      exports: {
        default: {
          required: true,
          type: {
            from: "@cmx-tools/contracts",
            import: "CmxNode",
          },
        },
      },
      externals: ["@pkg/ui"],
      unsupportedValues: "error",
      unverifiedOptionalExports: "omit",
    };

    expect(config.unsupportedValues).toBe("error");
    expect(config.dangerouslyAllowInnerHtml).toBe(true);
    expect(config.unverifiedOptionalExports).toBe("omit");
  });
});
