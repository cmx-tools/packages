import { describe, expect, it } from "vitest";
import { parseCmxBundleJson } from "cmx-bundle";

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
          entries: [
            {
              name: "home",
              file: "home.js",
              sourcemap: "home.js.map",
              meta: {
                type: {
                  from: "@site/types",
                  import: "PageMeta",
                  extra: true,
                },
                extra: true,
              },
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
      entries: [
        {
          name: "home",
          file: "home.js",
          sourcemap: "home.js.map",
          meta: {
            type: {
              from: "@site/types",
              import: "PageMeta",
            },
          },
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
