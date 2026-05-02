import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "rolldown/utils";
import { describe, expect, it } from "vitest";
import { CMX_BUNDLE_FILE_NAME, type CmxBundle } from "cmx-contracts";
import { renderCmxDocuments } from "cmx-document-renderer";

describe("renderCmxDocuments", () => {
  it("returns an error result for a bundle with no entries", async () => {
    const bundleDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));

    await expect(
      renderCmxBundle({
        bundleDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          dependencies: [],
          entries: [],
          chunks: [],
        },
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

  it("loads the runtime protocol from the bundle import source", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `export default { kind: "element", tag: "main" };\n`,
      "utf8",
    );
    await writeFile(
      path.join(outDir, "runtime.js"),
      `export function isRuntimeNode(value) {
        return value && value.kind === "element";
      }\n`,
      "utf8",
    );

    await expect(
      renderCmxBundle({
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: pathToFileURL(path.join(outDir, "runtime.js")).href,
          },
          dependencies: [
            {
              name: "@theme/ui",
              specifier: "^1.0.0",
              version: "1.2.3",
            },
          ],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
      }),
    ).resolves.toEqual({
      result: "complete",
      entries: {
        entry: {
          result: "document",
          document: {
            $schema: "https://example.org/todo.v1.json",
            cmxVersion: 1,
            dependencies: [],
            tree: {
              type: "element",
              tag: "main",
            },
          },
        },
      },
      diagnostics: [],
    });
  });

  it("selects dependencies from rendered external component refs", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `export default { kind: "component", from: "@theme/ui/button", import: "Button" };\n`,
      "utf8",
    );
    await writeFile(
      path.join(outDir, "runtime.js"),
      `export function isRuntimeNode(value) {
        return value && value.kind === "component";
      }\n`,
      "utf8",
    );

    await expect(
      renderCmxBundle({
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: pathToFileURL(path.join(outDir, "runtime.js")).href,
          },
          dependencies: [
            {
              name: "@theme/ui",
              specifier: "^1.0.0",
              version: "1.2.3",
            },
            {
              name: "@theme/unused",
              specifier: "^2.0.0",
              version: "2.3.4",
            },
          ],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
      }),
    ).resolves.toMatchObject({
      result: "complete",
      entries: {
        entry: {
          result: "document",
          document: {
            dependencies: [
              {
                name: "@theme/ui",
                specifier: "^1.0.0",
                version: "1.2.3",
              },
            ],
            tree: {
              type: "component",
              from: "@theme/ui/button",
              import: "Button",
            },
          },
        },
      },
    });
  });

  it("selects dependencies from emitted typed meta refs", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `export const meta = { title: "Home" };\nexport default "Home";\n`,
      "utf8",
    );

    await expect(
      renderCmxBundle({
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          dependencies: [
            {
              name: "@theme/content",
              specifier: "workspace:*",
              version: "0.0.0",
            },
            {
              name: "@theme/unused",
              specifier: "^2.0.0",
              version: "2.3.4",
            },
          ],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
              meta: {
                type: {
                  from: "@theme/content",
                  import: "PageMeta",
                },
              },
            },
          ],
          chunks: [],
        },
      }),
    ).resolves.toMatchObject({
      result: "complete",
      entries: {
        entry: {
          result: "document",
          document: {
            dependencies: [
              {
                name: "@theme/content",
                specifier: "workspace:*",
                version: "0.0.0",
              },
            ],
            meta: {
              type: {
                from: "@theme/content",
                import: "PageMeta",
              },
              data: {
                title: "Home",
              },
            },
            tree: "Home",
          },
        },
      },
    });
  });

  it("returns a top-level error when the runtime protocol cannot be loaded", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `throw new Error("entry was imported");\n`,
      "utf8",
    );
    const importSource = pathToFileURL(path.join(outDir, "missing.js")).href;

    await expect(
      renderCmxBundle({
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource,
          },
          dependencies: [],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
      }),
    ).resolves.toEqual({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "runtime-protocol-unavailable",
          message: `CMX runtime protocol could not be loaded from "${importSource}".`,
        },
      ],
    });
  });

  it("returns a top-level error when the runtime protocol is invalid", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `throw new Error("entry was imported");\n`,
      "utf8",
    );
    await writeFile(path.join(outDir, "runtime.js"), `export {};\n`, "utf8");
    const importSource = pathToFileURL(path.join(outDir, "runtime.js")).href;

    await expect(
      renderCmxBundle({
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource,
          },
          dependencies: [],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
      }),
    ).resolves.toEqual({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "invalid-runtime-protocol",
          message: `CMX runtime protocol from "${importSource}" does not export isRuntimeNode.`,
        },
      ],
    });
  });

  it("returns complete when all entries render", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      `export default "rendered";\n`,
      "utf8",
    );

    await expect(
      renderCmxBundle({
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          dependencies: [],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
      }),
    ).resolves.toEqual({
      result: "complete",
      entries: {
        entry: {
          result: "document",
          document: {
            $schema: "https://example.org/todo.v1.json",
            cmxVersion: 1,
            dependencies: [],
            tree: "rendered",
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
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          dependencies: [],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
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
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          dependencies: [],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
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

  it("returns partial when at least one entry renders and at least one entry fails", async () => {
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
      bundleDir: outDir,
      bundle: {
        version: 1,
        runtime: {
          importSource: "cmx-runtime",
        },
        dependencies: [],
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
    });

    expect(result).toMatchObject({
      result: "partial",
      entries: {
        home: {
          result: "document",
          document: {
            tree: "Home",
          },
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

  it("returns error when zero entries render", async () => {
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
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          dependencies: [],
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
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          dependencies: [],
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

  it("omits source when generated frames cannot be mapped through sourcemaps", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      [
        `const error = new Error("unmapped runtime error");`,
        `error.stack = [`,
        `  "Error: unmapped runtime error",`,
        `  "    at Page (file://${path.join(outDir, "entry.js")}:1:7)",`,
        `  "    at Page (/workspace/content/entry.tsx:12:3)",`,
        `].join("\\n");`,
        `throw error;`,
      ].join("\n"),
      "utf8",
    );

    await expect(
      renderCmxBundle({
        bundleDir: outDir,
        bundle: {
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          dependencies: [],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [],
        },
      }),
    ).resolves.toEqual({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "unmapped runtime error",
        },
      ],
    });
  });
});

async function renderCmxBundle(input: {
  bundleDir: string;
  bundle: CmxBundle;
}): ReturnType<typeof renderCmxDocuments> {
  await writeFile(
    path.join(input.bundleDir, CMX_BUNDLE_FILE_NAME),
    `${JSON.stringify(input.bundle, null, 2)}\n`,
    "utf8",
  );
  return renderCmxDocuments({
    bundleDir: input.bundleDir,
  });
}

async function writeCompiledEntry(
  outDir: string,
  fileName: string,
  sourcefile: string,
  source: string,
): Promise<void> {
  const compiled = await transform(sourcefile, source, {
    lang: "tsx",
    sourceType: "module",
    sourcemap: true,
  });
  if (compiled.errors.length > 0) {
    throw compiled.errors[0];
  }
  if (!compiled.map) {
    throw new Error("expected source map from transform");
  }
  await writeFile(path.join(outDir, fileName), compiled.code, "utf8");
  await writeFile(
    path.join(outDir, `${fileName}.map`),
    JSON.stringify(compiled.map),
    "utf8",
  );
}
