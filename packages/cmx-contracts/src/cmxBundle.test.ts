import { describe, expect, it } from "vitest";
import { parseCmxBundleJson } from "cmx-contracts";

describe("parseCmxBundleJson", () => {
  it("accepts a v1 bundle with additive fields", () => {
    expect(
      parseCmxBundleJson(
        JSON.stringify({
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
            extra: true,
          },
          exports: {
            default: {
              required: true,
              type: {
                from: "cmx-contracts",
                import: "CmxNode",
                extra: true,
              },
              extra: true,
            },
          },
          unsupportedValues: "error",
          unverifiedOptionalExports: "omit",
          dependencies: [
            {
              name: "@site/types",
              specifier: "^1.0.0",
              version: "1.2.3",
              integrity: "sha512-test",
              extra: true,
            },
          ],
          entries: [
            {
              name: "home",
              file: "home.js",
              sourcemap: "home.js.map",
              extra: true,
            },
          ],
          chunks: [
            {
              file: "shared.js",
              sourcemap: "shared.js.map",
              isEntry: false,
              extra: true,
            },
          ],
          extra: true,
        }),
      ),
    ).toEqual({
      version: 1,
      runtime: {
        importSource: "cmx-runtime",
      },
      exports: {
        default: {
          required: true,
          type: {
            from: "cmx-contracts",
            import: "CmxNode",
          },
        },
      },
      unsupportedValues: "error",
      unverifiedOptionalExports: "omit",
      dependencies: [
        {
          name: "@site/types",
          specifier: "^1.0.0",
          version: "1.2.3",
          integrity: "sha512-test",
        },
      ],
      entries: [
        {
          name: "home",
          file: "home.js",
          sourcemap: "home.js.map",
        },
      ],
      chunks: [
        {
          file: "shared.js",
          sourcemap: "shared.js.map",
          isEntry: false,
        },
      ],
    });
  });

  it("rejects invalid JSON and invalid v1 bundle shape", () => {
    expect(() => parseCmxBundleJson("{")).toThrow(SyntaxError);
    expect(() =>
      parseCmxBundleJson(
        JSON.stringify({
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          exports: {},
          unsupportedValues: "error",
          unverifiedOptionalExports: "error",
          dependencies: [],
          entries: [
            {
              name: "home",
              file: "home.js",
            },
          ],
          chunks: [],
        }),
      ),
    ).toThrow("Invalid CMX bundle");
  });
});
