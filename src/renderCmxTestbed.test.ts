import { describe, expect, it } from "vitest";
import {
  renderCmxTestbed,
  type RenderCmxTestbedCompleteResult,
  type RenderCmxTestbedPartialResult,
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

describe("renderCmxTestbed", () => {
  it("maps runtime errors back to authored source through bundle sourcemaps", async () => {
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
      bundle: {
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
        "cmx-bundle.json": expect.stringContaining('"entries"'),
      },
    });
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

    expect(Object.keys(result.entries)).toEqual(["home", "about"]);
    expect(result.entries.home.tree).toEqual({
      type: "element",
      tag: "main",
      children: ["Home ", 1],
    });
    expect(result.entries.about.tree).toEqual({
      type: "element",
      tag: "main",
      children: ["About ", 1],
    });
    expect(result.bundle.entries).toEqual([
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
    ]);
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

    expect(Object.keys(result.entries)).toEqual(["home", "broken"]);
    expect(result.entries.home).toMatchObject({
      result: "tree",
      tree: {
        type: "element",
        tag: "main",
        children: ["Home"],
      },
    });
    expect(result.entries.broken).toEqual({
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
    });
    expect(result.diagnostics).toEqual([
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
    ]);
  });

  it("renders fragments through the bundle boundary", async () => {
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

  it("renders root arrays and nested child arrays through the bundle boundary", async () => {
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

  it("flattens async component array output in child position", async () => {
    const result = expectTreeResult(
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

    expect(result.tree).toEqual({
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
    const result = expectTreeResult(
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

    expect(result.tree).toEqual({
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
  });

  it("preserves local component children shape through the bundle boundary", async () => {
    const result = expectTreeResult(
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

    expect(result.tree).toEqual({
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
    const result = expectTreeResult(
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

    expect(result.tree).toEqual({
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

  it("normalizes props, slots, meta data, and rendered manifest through the bundle boundary", async () => {
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

  it("attaches named imported meta type refs from bundle metadata", async () => {
    const result = expectTreeResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            'import type { PageMeta } from "@theme/content";',
            "export const meta: PageMeta = { title: 'Hello' };",
            "export default <main>Hello</main>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.meta).toEqual({
      type: {
        from: "@theme/content",
        import: "PageMeta",
      },
      data: {
        title: "Hello",
      },
    });
    expect(result.bundle.entries[0]).toMatchObject({
      meta: {
        type: {
          from: "@theme/content",
          import: "PageMeta",
        },
      },
    });
    expect(result.manifest).toEqual({
      externals: [],
    });
  });

  it("attaches default imported meta type refs from bundle metadata", async () => {
    const result = expectTreeResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            'import type PageMeta from "@theme/content";',
            "export const meta: PageMeta = { title: 'Hello' };",
            "export default <main>Hello</main>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.meta).toEqual({
      type: {
        from: "@theme/content",
      },
      data: {
        title: "Hello",
      },
    });
    expect(result.bundle.entries[0]).toMatchObject({
      meta: {
        type: {
          from: "@theme/content",
        },
      },
    });
    expect(result.manifest).toEqual({
      externals: [],
    });
  });

  it("ignores complex meta type expressions", async () => {
    const result = expectTreeResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            'import type { PageMeta } from "@theme/content";',
            "export const meta: PageMeta<{ title: string }> = { title: 'Hello' };",
            "export default <main>Hello</main>;",
          ].join("\n"),
        },
      }),
    );

    expect(result.meta).toEqual({
      data: {
        title: "Hello",
      },
    });
    expect(result.bundle.entries[0]).not.toHaveProperty("meta");
  });

  it("ignores local imported meta type refs", async () => {
    const result = expectTreeResult(
      await renderCmxTestbed({
        files: {
          "entry.tsx": [
            'import type { PageMeta } from "./meta";',
            "export const meta: PageMeta = { title: 'Hello' };",
            "export default <main>Hello</main>;",
          ].join("\n"),
          "meta.ts": "export type PageMeta = { title: string };\n",
        },
      }),
    );

    expect(result.meta).toEqual({
      data: {
        title: "Hello",
      },
    });
    expect(result.bundle.entries[0]).not.toHaveProperty("meta");
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
