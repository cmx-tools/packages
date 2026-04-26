import { describe, expect, it } from "vitest";
import { renderCmxArtifact } from "content-management-jsx/cmx-tree-renderer";

describe("renderCmxArtifact", () => {
  it("returns an error result for an artifact with no entries", async () => {
    await expect(
      renderCmxArtifact({
        artifact: {
          runtime: {
            importSource: "@cmx/runtime",
          },
          entries: [],
          chunks: [],
        },
        outDir: "/unused",
      }),
    ).resolves.toEqual({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "CMX artifact has no entries.",
        },
      ],
    });
  });
});
