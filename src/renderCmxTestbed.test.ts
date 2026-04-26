import { describe, expect, it } from "vitest";
import {
  renderCmxTestbed,
  type RenderCmxTestbedResult,
  type RenderCmxTestbedSuccessResult,
} from "./renderCmxTestbed.js";

function expectTreeResult(
  result: RenderCmxTestbedResult,
): RenderCmxTestbedSuccessResult {
  expect(result.result).toBe("tree");
  if (result.result !== "tree") {
    throw new Error("expected tree result");
  }
  return result;
}

describe("renderCmxTestbed", () => {
  it("maps runtime errors back to authored source through artifact sourcemaps", async () => {
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
          source: {
            file: expect.stringMatching(/entry\.tsx$/u),
            line: 2,
            column: expect.any(Number),
          },
        },
      ],
      artifact: {
        entries: [
          {
            file: "entry.js",
            sourcemap: "entry.js.map",
          },
        ],
      },
    });
  });

  it("maps Layer 1 validation diagnostics to authored source without emitting an artifact", async () => {
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
          message: "Dynamic imports are not supported in CMX artifacts.",
          source: {
            file: expect.stringMatching(/entry\.tsx$/u),
            line: 2,
            column: expect.any(Number),
          },
        },
      ],
    });
    expect(result).not.toHaveProperty("artifact");
  });

  it("builds a TSX source fixture through the artifact boundary and renders CMX", async () => {
    const result = expectTreeResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": "export default <main>Hello</main>;\n",
        },
      }),
    );

    expect(result).toMatchObject({
      result: "tree",
      tree: {
        type: "element",
        tag: "main",
        children: ["Hello"],
      },
      diagnostics: [],
      artifact: {
        runtime: {
          importSource: "@cmx/runtime",
        },
        entries: [
          {
            file: "entry.js",
            sourcemap: "entry.js.map",
          },
        ],
      },
      files: {
        "entry.js": expect.stringContaining('from "@cmx/runtime/jsx-runtime"'),
        "entry.js.map": expect.stringContaining("entry.tsx"),
        "cmx-artifact.json": expect.stringContaining('"entries"'),
      },
    });
  });

  it("renders fragments through the artifact boundary", async () => {
    const result = expectTreeResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": "export default <><h1>A</h1><h2>B</h2></>;\n",
        },
      }),
    );

    expect(result.tree).toEqual({
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

  it("renders primitive roots through the artifact boundary", async () => {
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
            expectTreeResult(
              await renderCmxTestbed({
                entry,
                files: {
                  [entry]: source,
                },
              }),
            ).tree,
        ),
      ),
    ).resolves.toEqual([null, true, "hello", 42]);
  });

  it("renders root arrays and nested child arrays through the artifact boundary", async () => {
    const result = expectTreeResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            "const chunks = [['before'], [[<strong key='deep'>deep</strong>]], 'after'];",
            "export default [<h1 key='a'>A</h1>, <p key='p'>{chunks}</p>, 'tail'];",
          ].join("\n"),
        },
      }),
    );

    expect(result.tree).toEqual({
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

  it("normalizes props, slots, meta data, and rendered manifest through the artifact boundary", async () => {
    const result = expectTreeResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            'import { __registerExternal } from "@cmx/runtime/jsx-runtime";',
            'const Hero = __registerExternal({ from: "@theme/ui", import: "Hero" });',
            'const Unused = __registerExternal({ from: "@theme/ui", import: "Unused" });',
            "const action = <button>Act</button>;",
            "const fake = { type: 'component', from: '@fake/ui', import: 'Fake' };",
            "void Unused;",
            "export const meta = { slug: 'home', preview: <span>Meta</span> };",
            "export default <main",
            "  id='home'",
            "  missing={undefined}",
            "  action={action}",
            "  data={{ fake, items: [undefined, <Hero tone='featured' />] }}",
            ">",
            "  <Hero />",
            "</main>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.tree).toEqual({
      type: "element",
      tag: "main",
      props: {
        id: "home",
        action: {
          type: "element",
          tag: "button",
          children: ["Act"],
        },
        data: {
          fake: {
            type: "component",
            from: "@fake/ui",
            import: "Fake",
          },
          items: [
            {
              type: "component",
              from: "@theme/ui",
              import: "Hero",
              props: {
                tone: "featured",
              },
            },
          ],
        },
      },
      slots: [["action"], ["data", "items", 0]],
      children: [
        {
          type: "component",
          from: "@theme/ui",
          import: "Hero",
        },
      ],
    });
    expect(result.meta).toEqual({
      data: {
        slug: "home",
        preview: {
          type: "element",
          tag: "span",
          children: ["Meta"],
        },
      },
    });
    expect(result.manifest).toEqual({
      externals: [
        {
          from: "@theme/ui",
          imports: ["Hero"],
        },
      ],
    });
  });

  it("renders configured external imports through importer-edge stubs", async () => {
    const result = expectTreeResult(
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

    expect(result.tree).toEqual({
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
    expect(result.manifest).toEqual({
      externals: [
        {
          from: "@theme/ui",
          imports: ["Card", "Hero"],
          default: true,
        },
      ],
    });
  });

  it("returns unsupported value diagnostics for props and meta data by default", async () => {
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

    await expect(
      renderCmxTestbed({
        files: {
          "entry.tsx": [
            "export const meta = { slug: 'home', build: () => 'x' };",
            "export default <main />;",
          ].join("\n"),
        },
      }),
    ).resolves.toMatchObject({
      result: "error",
      diagnostics: [
        {
          code: "unsupported-value",
          message: "Unsupported meta value at meta.build",
        },
      ],
    });
  });

  it("omits unsupported prop and meta data values when configured", async () => {
    const result = expectTreeResult(
      await renderCmxTestbed({
        unsupportedValues: "omit",
        files: {
          "entry.tsx": [
            "export const meta = { slug: 'home', build: () => 'x' };",
            "export default <button",
            "  onClick={() => {}}",
            "  data={{ keep: 'ok', nested: { skip: () => {}, pass: 42 } }}",
            "/>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.tree).toEqual({
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
    expect(result.meta).toEqual({
      data: {
        slug: "home",
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
    const result = expectTreeResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": "export default <main>Hello</main>;\n",
        },
      }),
    );

    expect(JSON.parse(JSON.stringify(result.tree))).toEqual(result.tree);
  });
});
