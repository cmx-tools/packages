import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { transform } from "esbuild";
import { describe, expect, it } from "vitest";
import { renderCmxBundle } from "content-management-jsx/cmx-tree-renderer";

describe("renderCmxBundle", () => {
  it("returns an error result for a bundle with no entries", async () => {
    await expect(
      renderCmxBundle({
        bundle: {
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
          message: "CMX bundle has no entries.",
        },
      ],
    });
  });

  it("returns a top-level error before importing entries when runtime import source mismatches", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `throw new Error("entry was imported");\n`,
      "utf8",
    );

    await expect(
      renderCmxBundle({
        bundle: {
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
            'CMX bundle targets runtime import source "other-runtime", but this executor expects "@cmx/runtime".',
        },
      ],
    });
  });

  it("renders entries when runtime import source matches", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `export default "rendered";\n`,
      "utf8",
    );

    await expect(
      renderCmxBundle({
        bundle: {
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

  it("maps render errors through entry sourcemaps", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeCompiledEntry(
      outDir,
      "entry.js",
      "../entry.tsx",
      [
        "export default function Page() {",
        "  throw new Error('render exploded');",
        "}",
      ].join("\n"),
    );

    await expect(
      renderCmxBundle({
        bundle: {
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
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "render exploded",
          source: {
            file: expect.stringMatching(/entry\.tsx$/u),
            line: 2,
            column: expect.any(Number),
          },
        },
      ],
    });
  });

  it("maps import errors through entry sourcemaps", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeCompiledEntry(
      outDir,
      "entry.js",
      "../entry.tsx",
      [
        "const value = 'import exploded';",
        "throw new Error(value);",
        "export default 'unreachable';",
      ].join("\n"),
    );

    await expect(
      renderCmxBundle({
        bundle: {
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
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "import exploded",
          source: {
            file: expect.stringMatching(/entry\.tsx$/u),
            line: 2,
            column: expect.any(Number),
          },
        },
      ],
    });
  });

  it("preserves mapped diagnostics on partial multi-entry results", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeCompiledEntry(
      outDir,
      "home.js",
      "../home.tsx",
      "export default 'Home';",
    );
    await writeCompiledEntry(
      outDir,
      "broken.js",
      "../broken.tsx",
      [
        "export default function Broken() {",
        "  throw new Error('entry exploded');",
        "}",
      ].join("\n"),
    );

    const result = await renderCmxBundle({
      bundle: {
        runtime: {
          importSource: "@cmx/runtime",
        },
        entries: [
          {
            name: "home",
            file: "home.js",
            sourcemap: "home.js.map",
          },
          {
            name: "broken",
            file: "broken.js",
            sourcemap: "broken.js.map",
          },
        ],
        chunks: [],
      },
      outDir,
    });

    expect(result).toMatchObject({
      result: "partial",
      entries: {
        home: {
          result: "tree",
          tree: "Home",
        },
        broken: {
          result: "error",
          diagnostics: [
            {
              severity: "error",
              code: "render-error",
              message: "entry exploded",
              source: {
                file: expect.stringMatching(/broken\.tsx$/u),
                line: 2,
                column: expect.any(Number),
              },
            },
          ],
        },
      },
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "entry exploded",
          source: {
            file: expect.stringMatching(/broken\.tsx$/u),
            line: 2,
            column: expect.any(Number),
          },
        },
      ],
    });
  });

  it("returns a fatal error result when every prebuilt entry fails", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "home.js"),
      `throw new Error("home exploded");\n`,
      "utf8",
    );
    await writeFile(
      path.join(outDir, "about.js"),
      `throw new Error("about exploded");\n`,
      "utf8",
    );

    await expect(
      renderCmxBundle({
        bundle: {
          runtime: {
            importSource: "@cmx/runtime",
          },
          entries: [
            {
              name: "home",
              file: "home.js",
              sourcemap: "home.js.map",
            },
            {
              name: "about",
              file: "about.js",
              sourcemap: "about.js.map",
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
          code: "render-error",
          message: "home exploded",
        },
        {
          severity: "error",
          code: "render-error",
          message: "about exploded",
        },
      ],
    });
  });

  it("maps runtime errors through chunk sourcemaps", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `import "./shared.js";\nexport default "unreachable";\n`,
      "utf8",
    );
    await writeFile(
      path.join(outDir, "entry.js.map"),
      JSON.stringify({
        version: 3,
        sources: ["../entry.tsx"],
        mappings: "",
      }),
      "utf8",
    );
    await writeCompiledEntry(
      outDir,
      "shared.js",
      "../shared.tsx",
      ["const value = 'shared exploded';", "throw new Error(value);"].join(
        "\n",
      ),
    );

    await expect(
      renderCmxBundle({
        bundle: {
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
          chunks: [
            {
              file: "shared.js",
              sourcemap: "shared.js.map",
              isEntry: false,
            },
          ],
        },
        outDir,
      }),
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "shared exploded",
          source: {
            file: expect.stringMatching(/shared\.tsx$/u),
            line: 2,
            column: expect.any(Number),
          },
        },
      ],
    });
  });
});

async function writeCompiledEntry(
  outDir: string,
  fileName: string,
  sourcefile: string,
  source: string,
): Promise<void> {
  const compiled = await transform(source, {
    format: "esm",
    loader: "tsx",
    sourcemap: "external",
    sourcefile,
  });
  await writeFile(path.join(outDir, fileName), compiled.code, "utf8");
  await writeFile(path.join(outDir, `${fileName}.map`), compiled.map, "utf8");
}
