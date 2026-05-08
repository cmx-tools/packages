import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { transform } from "rolldown/utils";
import { describe, expect, it } from "vitest";
import { CMX_BUNDLE_FILE_NAME, type CmxBundle } from "cmx-contracts";
import { renderCmxDocuments } from "cmx-document-renderer";

const CMX_RUNTIME_JSX_RUNTIME_IMPORT_SOURCE = import.meta
  .resolve("cmx-runtime/jsx-runtime");

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
            $schema:
              "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
            cmxVersion: 1,
            interface: {
              imports: {},
              exports: {
                default: {
                  type: {
                    from: "cmx-contracts",
                    import: "CmxNode",
                  },
                  slots: [[]],
                },
              },
            },
            content: {
              default: {
                type: "element",
                tag: "main",
              },
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
            interface: {
              imports: {
                "@theme/ui": {
                  name: "@theme/ui",
                  specifier: "^1.0.0",
                  version: "1.2.3",
                },
              },
            },
            content: {
              default: {
                type: "component",
                from: "@theme/ui/button",
                import: "Button",
              },
            },
          },
        },
      },
    });
  });

  it("returns complete when all entries render", async () => {
    const outDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
    await writeFile(
      path.join(outDir, "entry.js"),
      [
        `import { jsx } from "${CMX_RUNTIME_JSX_RUNTIME_IMPORT_SOURCE}";`,
        `export default jsx("main", { children: "rendered" });`,
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
      result: "complete",
      entries: {
        entry: {
          result: "document",
          document: {
            $schema:
              "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
            cmxVersion: 1,
            interface: {
              imports: {},
              exports: {
                default: {
                  type: {
                    from: "cmx-contracts",
                    import: "CmxNode",
                  },
                  slots: [[]],
                },
              },
            },
            content: {
              default: {
                type: "element",
                tag: "main",
                children: ["rendered"],
              },
            },
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
      [
        `import { jsx } from "${CMX_RUNTIME_JSX_RUNTIME_IMPORT_SOURCE}";`,
        `export default jsx("main", { children: "Home" });`,
      ].join("\n"),
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
            interface: {
              exports: {
                default: {
                  type: {
                    from: "cmx-contracts",
                    import: "CmxNode",
                  },
                  slots: [[]],
                },
              },
            },
            content: {
              default: {
                type: "element",
                tag: "main",
                children: ["Home"],
              },
            },
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
  bundle: Omit<
    CmxBundle,
    "exports" | "unsupportedValues" | "unverifiedOptionalExports" | "entries"
  > & {
    entries?: Array<
      Omit<CmxBundle["entries"][number], "sourceExports"> &
        Partial<Pick<CmxBundle["entries"][number], "sourceExports">>
    >;
  } & Partial<
      Pick<
        CmxBundle,
        "exports" | "unsupportedValues" | "unverifiedOptionalExports"
      >
    >;
}): ReturnType<typeof renderCmxDocuments> {
  const bundle: CmxBundle = {
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
    unverifiedOptionalExports: "error",
    ...input.bundle,
    entries: (input.bundle.entries ?? []).map((entry) => ({
      ...entry,
      sourceExports: entry.sourceExports ?? {
        default: {
          type: {
            from: "cmx-contracts",
            import: "CmxNode",
          },
        },
      },
    })),
  };
  await writeFile(
    path.join(input.bundleDir, CMX_BUNDLE_FILE_NAME),
    `${JSON.stringify(bundle, null, 2)}\n`,
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
