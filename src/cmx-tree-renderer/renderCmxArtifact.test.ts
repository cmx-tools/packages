import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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

  it("returns a top-level error before importing entries when runtime import source mismatches", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-artifact-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `throw new Error("entry was imported");\n`,
      "utf8",
    );

    await expect(
      renderCmxArtifact({
        artifact: {
          runtime: {
            importSource: "other-runtime",
          },
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
        outDir,
      }),
    ).resolves.toEqual({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "runtime-import-source-mismatch",
          message:
            'CMX artifact targets runtime import source "other-runtime", but this executor expects "@cmx/runtime".',
        },
      ],
    });
  });

  it("renders entries when runtime import source matches", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-artifact-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `export default "rendered";\n`,
      "utf8",
    );

    await expect(
      renderCmxArtifact({
        artifact: {
          runtime: {
            importSource: "@cmx/runtime",
          },
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
        outDir,
      }),
    ).resolves.toEqual({
      result: "complete",
      entries: {
        entry: {
          result: "tree",
          tree: "rendered",
          manifest: {
            externals: [],
          },
        },
      },
      diagnostics: [],
    });
  });
});
