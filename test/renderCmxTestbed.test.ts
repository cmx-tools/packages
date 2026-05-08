import { access } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderCmxTestbed,
  type RenderCmxTestbedCompleteResult,
  type RenderCmxTestbedPartialResult,
  type RenderCmxTestbedResult,
  type RenderCmxTestbedSuccessResult,
} from "./renderCmxTestbed.js";

function expectDocumentResult(
  result: RenderCmxTestbedResult,
): RenderCmxTestbedSuccessResult {
  expect(result.result).toBe("document");
  if (result.result !== "document") {
    throw new Error("expected document result");
  }
  return result;
}

function expectCompleteResult(
  result: RenderCmxTestbedResult,
): RenderCmxTestbedCompleteResult {
  expect(result.result).toBe("complete");
  if (result.result !== "complete") {
    throw new Error("expected complete result");
  }
  return result;
}

function expectPartialResult(
  result: RenderCmxTestbedResult,
): RenderCmxTestbedPartialResult {
  expect(result.result).toBe("partial");
  if (result.result !== "partial") {
    throw new Error("expected partial result");
  }
  return result;
}

const THEME_UI_IMPORTS = {
  "@theme/ui": {
    name: "@theme/ui",
    specifier: "^0.0.0",
    version: "0.0.0",
  },
};

describe("renderCmxTestbed", () => {
  it("omits source for runtime errors without generated bundle frames", async () => {
    await expect(
      renderCmxTestbed({
        files: {
          "entry.tsx": [
            "export default function Page() {",
            "  throw new Error('render exploded');",
            "}",
          ].join("\n"),
        },
      }),
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "render exploded",
        },
      ],
      bundle: {
        entries: [
          {
            file: "entry.js",
            sourcemap: "entry.js.map",
          },
        ],
      },
    });
  });

  it("maps bundler validation diagnostics to authored source without emitting a bundle", async () => {
    const result = await renderCmxTestbed({
      files: {
        "entry.tsx": [
          "export default async function Page() {",
          "  await import('./other');",
          "  return <main />;",
          "}",
        ].join("\n"),
      },
    });

    expect(result).toMatchObject({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "dynamic-import-unsupported",
          message: "Dynamic imports are not supported in CMX bundles.",
          source: {
            file: expect.stringMatching(/entry\.tsx$/u),
            line: 2,
            column: expect.any(Number),
          },
        },
      ],
    });
    expect(result).not.toHaveProperty("bundle");
  });

  it("rejects namespace imports from configured externals without emitting a bundle", async () => {
    const result = await renderCmxTestbed({
      externals: ["@theme/ui"],
      files: {
        "entry.tsx": [
          'import * as UI from "@theme/ui";',
          "export default <UI.H1 />;",
        ].join("\n"),
      },
    });

    expect(result).toMatchObject({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "external-namespace-import-unsupported",
          message:
            "Namespace imports from configured externals are not supported.",
          source: {
            file: expect.stringMatching(/entry\.tsx$/u),
            line: 1,
            column: expect.any(Number),
          },
        },
      ],
    });
    expect(result).not.toHaveProperty("bundle");
  });

  it("rejects side-effect-only imports from configured externals without emitting a bundle", async () => {
    const result = await renderCmxTestbed({
      externals: ["@theme/ui"],
      files: {
        "entry.tsx": ['import "@theme/ui";', "export default <main />;"].join(
          "\n",
        ),
      },
    });

    expect(result).toMatchObject({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "external-side-effect-import-unsupported",
          message:
            "Side-effect-only imports from configured externals are not supported.",
          source: {
            file: expect.stringMatching(/entry\.tsx$/u),
            line: 1,
            column: expect.any(Number),
          },
        },
      ],
    });
    expect(result).not.toHaveProperty("bundle");
  });

  it("rejects external component function calls without emitting a bundle", async () => {
    const result = await renderCmxTestbed({
      externals: ["@theme/ui"],
      files: {
        "entry.tsx": [
          'import { H1 } from "@theme/ui";',
          'export default H1({ children: "Hello" });',
        ].join("\n"),
      },
    });

    expect(result).toMatchObject({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "external-component-call-unsupported",
          message:
            "Configured external imports must be rendered as JSX components.",
          source: {
            file: expect.stringMatching(/entry\.tsx$/u),
            line: 2,
            column: expect.any(Number),
          },
        },
      ],
    });
    expect(result).not.toHaveProperty("bundle");
  });

  it("rejects configured external imports used as runtime values without emitting a bundle", async () => {
    const result = await renderCmxTestbed({
      externals: ["@theme/ui"],
      files: {
        "entry.tsx": [
          'import { themeName } from "@theme/ui";',
          "export default <p>{themeName}</p>;",
        ].join("\n"),
      },
    });

    expect(result).toMatchObject({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "external-runtime-value-unsupported",
          message:
            "Configured external imports cannot be used as runtime values.",
          source: {
            file: expect.stringMatching(/entry\.tsx$/u),
            line: 2,
            column: expect.any(Number),
          },
        },
      ],
    });
    expect(result).not.toHaveProperty("bundle");
  });

  it("builds a TSX source fixture through the bundle boundary and renders CMX", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": "export default <main>Hello</main>;\n",
        },
      }),
    );

    expect(result).toMatchObject({
      result: "document",
      document: {
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
            children: ["Hello"],
          },
        },
      },
      diagnostics: [],
      bundle: {
        runtime: {
          importSource: "cmx-runtime",
        },
        entries: [
          {
            file: "entry.js",
            sourcemap: "entry.js.map",
          },
        ],
      },
      files: {
        "entry.js": expect.stringContaining('from "cmx-runtime/jsx-runtime"'),
        "entry.js.map": expect.stringContaining("entry.tsx"),
        "cmx-bundle.json": expect.stringContaining('"entries"'),
      },
    });
  });

  it("resolves the workspace cmx-runtime package without materializing it beside tmp output", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": "export default <main>Hello</main>;\n",
        },
      }),
    );

    await expect(
      access(path.join(result.outDir, "node_modules", "cmx-runtime")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("builds a code-split multi-entry bundle and renders entries with one shared graph", async () => {
    const result = expectCompleteResult(
      await renderCmxTestbed({
        entries: ["home.tsx", "about.tsx"],
        files: {
          "home.tsx": [
            'import { sharedLoadCount } from "./shared";',
            "export default <main>Home {sharedLoadCount}</main>;",
          ].join("\n"),
          "about.tsx": [
            'import { sharedLoadCount } from "./shared";',
            "export default <main>About {sharedLoadCount}</main>;",
          ].join("\n"),
          "shared.tsx": [
            "const state = globalThis as typeof globalThis & { __cmxSharedLoads?: number };",
            "state.__cmxSharedLoads = (state.__cmxSharedLoads ?? 0) + 1;",
            "export const sharedLoadCount = state.__cmxSharedLoads;",
          ].join("\n"),
        },
      }),
    );

    expect(new Set(Object.keys(result.entries))).toEqual(
      new Set(["home", "about"]),
    );
    expect(result.entries.home.document.content.default).toEqual({
      type: "element",
      tag: "main",
      children: ["Home ", 1],
    });
    expect(result.entries.about.document.content.default).toEqual({
      type: "element",
      tag: "main",
      children: ["About ", 1],
    });
    expect(result.bundle.entries).toEqual(
      expect.arrayContaining([
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
      ]),
    );
    expect(result.bundle.entries).toHaveLength(2);
    expect(result.bundle.chunks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: expect.stringMatching(/^shared-/u),
          sourcemap: expect.stringMatching(/^shared-.*\.js\.map$/u),
          isEntry: false,
        }),
      ]),
    );
    for (const chunk of result.bundle.chunks) {
      expect(result.files).toHaveProperty(chunk.file);
      expect(result.files).toHaveProperty(chunk.sourcemap);
    }
  });

  it("marks multi-entry rendering partial when one entry fails", async () => {
    const result = expectPartialResult(
      await renderCmxTestbed({
        entries: ["home.tsx", "broken.tsx"],
        files: {
          "home.tsx": "export default <main>Home</main>;\n",
          "broken.tsx": [
            "export default function Broken() {",
            "  throw new Error('entry exploded');",
            "}",
          ].join("\n"),
        },
      }),
    );

    expect(new Set(Object.keys(result.entries))).toEqual(
      new Set(["home", "broken"]),
    );
    expect(result.entries.home).toMatchObject({
      result: "document",
      document: {
        content: {
          default: {
            type: "element",
            tag: "main",
            children: ["Home"],
          },
        },
      },
    });
    expect(result.entries.broken).toEqual({
      result: "error",
      diagnostics: [
        {
          severity: "error",
          code: "render-error",
          message: "entry exploded",
        },
      ],
    });
    expect(result.diagnostics).toEqual([
      {
        severity: "error",
        code: "render-error",
        message: "entry exploded",
      },
    ]);
  });

  it("renders fragments through the bundle boundary", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": "export default <><h1>A</h1><h2>B</h2></>;\n",
        },
      }),
    );

    expect(result.document.content.default).toEqual({
      type: "fragment",
      children: [
        {
          type: "element",
          tag: "h1",
          children: ["A"],
        },
        {
          type: "element",
          tag: "h2",
          children: ["B"],
        },
      ],
    });
  });

  it("renders primitive roots through the bundle boundary", async () => {
    const sources = {
      "null.tsx": "export default null;\n",
      "boolean.tsx": "export default true;\n",
      "string.tsx": "export default 'hello';\n",
      "number.tsx": "export default 42;\n",
    };

    await expect(
      Promise.all(
        Object.entries(sources).map(
          async ([entry, source]) =>
            expectDocumentResult(
              await renderCmxTestbed({
                entry,
                files: {
                  [entry]: source,
                },
              }),
            ).document.content.default,
        ),
      ),
    ).resolves.toEqual([null, true, "hello", 42]);
  });

  it("renders root arrays and nested child arrays through the bundle boundary", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            "const chunks = [['before'], [[<strong key='deep'>deep</strong>]], 'after'];",
            "export default [<h1 key='a'>A</h1>, <p key='p'>{chunks}</p>, 'tail'];",
          ].join("\n"),
        },
      }),
    );

    expect(result.document.content.default).toEqual({
      type: "fragment",
      children: [
        {
          type: "element",
          tag: "h1",
          children: ["A"],
        },
        {
          type: "element",
          tag: "p",
          children: [
            "before",
            {
              type: "element",
              tag: "strong",
              children: ["deep"],
            },
            "after",
          ],
        },
        "tail",
      ],
    });
  });

  it("flattens async component array output in child position", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            "async function AsyncLeaf({ label }: { label: string }) {",
            "  return <li>{label}</li>;",
            "}",
            "function SyncLeaf() {",
            "  return <li>sync</li>;",
            "}",
            "async function AsyncGroup() {",
            "  return [<AsyncLeaf label='a' />, [<SyncLeaf />, 'tail']];",
            "}",
            "export default <ul><AsyncGroup /><AsyncLeaf label='b' /></ul>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.document.content.default).toEqual({
      type: "element",
      tag: "ul",
      children: [
        {
          type: "element",
          tag: "li",
          children: ["a"],
        },
        {
          type: "element",
          tag: "li",
          children: ["sync"],
        },
        "tail",
        {
          type: "element",
          tag: "li",
          children: ["b"],
        },
      ],
    });
  });

  it("maps explicit children props through the bundle boundary", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        externals: ["@theme/ui"],
        files: {
          "entry.tsx": [
            'import { H1 } from "@theme/ui";',
            "export default <>",
            "  <p children='Intrinsic prop' />",
            "  <p children='Ignored prop'>Intrinsic JSX</p>",
            "  <H1 children='External prop' />",
            "  <H1 children='Ignored prop'>External JSX</H1>",
            "</>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.document.content.default).toEqual({
      type: "fragment",
      children: [
        {
          type: "element",
          tag: "p",
          children: ["Intrinsic prop"],
        },
        {
          type: "element",
          tag: "p",
          children: ["Intrinsic JSX"],
        },
        {
          type: "component",
          from: "@theme/ui",
          import: "H1",
          children: ["External prop"],
        },
        {
          type: "component",
          from: "@theme/ui",
          import: "H1",
          children: ["External JSX"],
        },
      ],
    });
    expect(result.document.interface.imports).toEqual(THEME_UI_IMPORTS);
  });

  it("preserves local component children shape through the bundle boundary", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            "function Shape({ children }: { children?: unknown }) {",
            "  return <p>{Array.isArray(children) ? 'array' : 'scalar'}</p>;",
            "}",
            "export default <><Shape>One</Shape><Shape><span />Two</Shape></>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.document.content.default).toEqual({
      type: "fragment",
      children: [
        {
          type: "element",
          tag: "p",
          children: ["scalar"],
        },
        {
          type: "element",
          tag: "p",
          children: ["array"],
        },
      ],
    });
  });

  it("preserves JSX text boundaries through the bundle boundary", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            "export default <section>",
            "  alpha",
            "  {/* hidden note */}",
            "  beta",
            "  <p>hello{' '}world{''}!</p>",
            "</section>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.document.content.default).toEqual({
      type: "element",
      tag: "section",
      children: [
        "alpha",
        "beta",
        {
          type: "element",
          tag: "p",
          children: ["hello", " ", "world", "", "!"],
        },
      ],
    });
  });

  it("normalizes props and default export slot interface through the bundle boundary", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        externals: ["@theme/ui"],
        files: {
          "entry.tsx": [
            'import Hero from "@theme/ui";',
            "const action = <button>Act</button>;",
            "export default <main action={action}><Hero /></main>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.document.interface).toEqual({
      imports: THEME_UI_IMPORTS,
      exports: {
        default: {
          type: {
            from: "cmx-contracts",
            import: "CmxNode",
          },
          slots: [[]],
        },
      },
    });
    expect(result.document.content.default).toEqual({
      type: "element",
      tag: "main",
      props: {
        action: {
          type: "element",
          tag: "button",
          children: ["Act"],
        },
      },
      slots: [["action"]],
      children: [
        {
          type: "component",
          from: "@theme/ui",
        },
      ],
    });
    expect(result.document).not.toHaveProperty("tree");
    expect(result.document).not.toHaveProperty("meta");
    expect(result.document).not.toHaveProperty("dependencies");
  });

  it("renders configured external imports through importer-edge stubs", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        externals: ["@theme/ui"],
        files: {
          "entry.tsx": [
            'import HeroDefault, { Hero as PageHero, Unused } from "@theme/ui";',
            'import { Teaser } from "./teaser";',
            "export default <><HeroDefault /><PageHero /><Teaser /></>;",
          ].join("\n"),
          "teaser.tsx": [
            'import { Card as TeaserCard } from "@theme/ui";',
            "export function Teaser() {",
            "  return <TeaserCard tone='compact' />;",
            "}",
          ].join("\n"),
        },
      }),
    );

    expect(result.document.content.default).toEqual({
      type: "fragment",
      children: [
        {
          type: "component",
          from: "@theme/ui",
        },
        {
          type: "component",
          from: "@theme/ui",
          import: "Hero",
        },
        {
          type: "component",
          from: "@theme/ui",
          import: "Card",
          props: {
            tone: "compact",
          },
        },
      ],
    });
    expect(result.document.interface.imports).toEqual(THEME_UI_IMPORTS);
  });

  it("returns unsupported value diagnostics for props by default", async () => {
    await expect(
      renderCmxTestbed({
        files: {
          "entry.tsx": "export default <button onClick={() => {}} />;\n",
        },
      }),
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          code: "unsupported-value",
          message: "Unsupported prop value at default export.props.onClick",
        },
      ],
    });
  });

  it("omits unsupported prop values when configured", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        unsupportedValues: "omit",
        files: {
          "entry.tsx": [
            "export default <button",
            "  onClick={() => {}}",
            "  data={{ keep: 'ok', nested: { skip: () => {}, pass: 42 } }}",
            "/>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.document.content.default).toEqual({
      type: "element",
      tag: "button",
      props: {
        data: {
          keep: "ok",
          nested: {
            pass: 42,
          },
        },
      },
    });
  });

  it("returns diagnostics for invalid root and child output", async () => {
    await expect(
      renderCmxTestbed({
        files: {
          "entry.tsx": "export default () => undefined;\n",
        },
      }),
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          code: "undefined-value",
          message: "default export resolved to undefined",
        },
      ],
    });

    await expect(
      renderCmxTestbed({
        files: {
          "entry.tsx": "export default <article>{undefined}</article>;\n",
        },
      }),
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          code: "undefined-value",
          message: "default export.children[0] resolved to undefined",
        },
      ],
    });

    await expect(
      renderCmxTestbed({
        files: {
          "entry.tsx": "export default { hello: 'world' };\n",
        },
      }),
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          code: "invalid-runtime-output",
          message: "default export is not CMX runtime output",
        },
      ],
    });

    await expect(
      renderCmxTestbed({
        files: {
          "entry.tsx":
            "export default <article>{{ hello: 'world' }}</article>;\n",
        },
      }),
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          code: "invalid-runtime-output",
          message: "default export.children[0] is not CMX runtime output",
        },
      ],
    });
  });

  it("returns plain serializable CMX output only", async () => {
    const result = expectDocumentResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": "export default <main>Hello</main>;\n",
        },
      }),
    );

    expect(JSON.parse(JSON.stringify(result.document.content.default))).toEqual(
      result.document.content.default,
    );
  });
});
