import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import os from "node:os";
import path from "node:path";
import type {
  FileSystem,
  TranspileErrorResult,
  TranspileModuleResult,
  TranspileSuccessResult,
} from "../src/transpile-module/index.js";
import {
  ErrorCode,
  transpileModule,
} from "../src/transpile-module/index.js";

type SourceFixtures = Record<string, string>;

function createVirtualFs(files: SourceFixtures): FileSystem {
  return {
    async readFile(filePath: string): Promise<string | undefined> {
      return files[filePath];
    },
  };
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-spike-"));
  await run(tempDir);
}

async function writeFixturesToDisk(
  rootDir: string,
  fixtures: SourceFixtures,
): Promise<void> {
  for (const [relativePath, source] of Object.entries(fixtures)) {
    const absolutePath = path.join(rootDir, relativePath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, source, "utf8");
  }
}

function expectTreeResult(
  result: TranspileModuleResult,
): TranspileSuccessResult {
  expect(result.kind).toBe("success");
  if (result.kind !== "success") {
    throw new Error("expected tree result");
  }
  return result;
}

function expectErrorResult(
  result: TranspileModuleResult,
): TranspileErrorResult {
  expect(result.kind).toBe("error");
  if (result.kind !== "error") {
    throw new Error("expected error result");
  }
  return result;
}

describe("transpileModule", () => {
  describe("source-to-output contract (real fs)", () => {
    it("returns tree, meta, manifest, and diagnostics for valid source input", async () => {
      await withTempDir(async (tempDir) => {
        await writeFixturesToDisk(tempDir, {
          "helper.tsx":
            "export function Hero({ title }: { title: string }) { return <h1>{title}</h1>; }",
          "meta-helper.ts":
            "export function buildMeta(slug: string) { return { slug, from: 'helper' as const }; }",
          "entry.tsx": [
            "import { Hero } from './helper';",
            "import { buildMeta } from './meta-helper';",
            "export const meta = buildMeta('hello-world');",
            "export default function Page() {",
            "  return <section><Hero title='Hello' /></section>;",
            "}",
          ].join("\n"),
        });

        const result = expectTreeResult(
          await transpileModule({
            entryFile: path.join(tempDir, "entry.tsx"),
          }),
        );

        expect(result.tree).toEqual({
          type: "element",
          tag: "section",
          children: [
            {
              type: "element",
              tag: "h1",
              children: ["Hello"],
            },
          ],
        });
        expect(result.meta).toEqual({
          data: { slug: "hello-world", from: "helper" },
        });
        expect(result.manifest).toEqual({ externals: [] });
        expect(result.diagnostics).toEqual([]);
      });
    });

    it("returns error + diagnostics when default export is missing", async () => {
      await withTempDir(async (tempDir) => {
        await writeFixturesToDisk(tempDir, {
          "entry.tsx": "export const value = 1;\n",
        });

        const result = expectErrorResult(
          await transpileModule({
            entryFile: path.join(tempDir, "entry.tsx"),
          }),
        );

        expect(result.diagnostics.length).toBeGreaterThan(0);
        expect(result.diagnostics[0]?.code).toBe(
          ErrorCode.MISSING_DEFAULT_EXPORT,
        );
        expect(result.diagnostics[0]?.message).toMatch(
          /has no default export/u,
        );
      });
    });
  });

  describe("source-to-output contract (virtual fs)", () => {
    it("emits meta as wrapped data when meta export exists", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "export const meta = { slug: 'wrapped' };",
          "export default <main />;",
        ].join("\n"),
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.meta).toEqual({
        data: {
          slug: "wrapped",
        },
      });
    });

    it("omits meta field when meta export does not exist", async () => {
      const entryFile = "/virtual/no-meta.tsx";
      const fs = createVirtualFs({
        [entryFile]: "export default <main />;",
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result).not.toHaveProperty("meta");
    });

    it("returns error when meta contains unsupported value by default", async () => {
      const entryFile = "/virtual/meta-unsupported.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "export const meta = {",
          "  slug: 'ok',",
          "  onBuild: () => 'not-serializable',",
          "};",
          "export default <main />;",
        ].join("\n"),
      });

      const result = expectErrorResult(await transpileModule({ entryFile, fs }));

      expect(result.diagnostics[0]).toEqual({
        code: ErrorCode.UNSUPPORTED_VALUE,
        message: "Unsupported meta value at meta.onBuild",
      });
    });

    it("omits unsupported meta values when configured to omit", async () => {
      const entryFile = "/virtual/meta-omit.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "export const meta = {",
          "  slug: 'ok',",
          "  nested: {",
          "    keep: 1,",
          "    skip: () => 'x',",
          "  },",
          "};",
          "export default <main />;",
        ].join("\n"),
      });

      const result = expectTreeResult(
        await transpileModule({
          entryFile,
          fs,
          unsupportedValues: "omit",
        }),
      );

      expect(result.meta).toEqual({
        data: {
          slug: "ok",
          nested: {
            keep: 1,
          },
        },
      });
    });

    it("transpiles virtual module graph via public API", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { Hero } from './helper';",
          "export const meta = { slug: 'virtual' };",
          "export default <main><Hero title='Hello VFS' /></main>;",
        ].join("\n"),
        "/virtual/helper.tsx":
          "export function Hero({ title }) { return <h1>{title}</h1>; }",
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "main",
        children: [
          {
            type: "element",
            tag: "h1",
            children: ["Hello VFS"],
          },
        ],
      });
      expect(result.meta).toEqual({
        data: { slug: "virtual" },
      });
      expect(result.manifest).toEqual({ externals: [] });
      expect(result.diagnostics).toEqual([]);
    });

    it("emits compact intrinsic CMX element nodes", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "export default <>",
          "  <label htmlFor='email' className='pink'>Email</label>",
          "  <div />",
          "</>;",
        ].join("\n"),
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "fragment",
        children: [
          {
            type: "element",
            tag: "label",
            props: {
              htmlFor: "email",
              className: "pink",
            },
            children: ["Email"],
          },
          {
            type: "element",
            tag: "div",
          },
        ],
      });
      expect(result.manifest).toEqual({ externals: [] });
      expect(result.diagnostics).toEqual([]);
    });

    it("omits undefined props and preserves spread/style prop data", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "const base = { id: 'hero', hidden: undefined };",
          "export default <label",
          "  {...base}",
          "  htmlFor='email'",
          "  className={undefined}",
          "  style={{ color: 'red', nested: { ok: true } }}",
          "/>;",
        ].join("\n"),
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "label",
        props: {
          id: "hero",
          htmlFor: "email",
          style: {
            color: "red",
            nested: { ok: true },
          },
        },
      });
    });

    it("returns error when prop contains unsupported function value by default", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: "export default <button onClick={() => {}} data-x='ok' />;",
      });

      const result = expectErrorResult(
        await transpileModule({ entryFile, fs }),
      );

      expect(result.diagnostics[0]).toEqual({
        code: ErrorCode.UNSUPPORTED_VALUE,
        message: "Unsupported prop value at default export.props.onClick",
      });
    });

    it("omits unsupported prop values when configured to omit", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "export default <button",
          "  onClick={() => {}}",
          "  data={{ keep: 'ok', nested: { skip: () => {}, pass: 42 } }}",
          "/>;",
        ].join("\n"),
      });

      const result = expectTreeResult(
        await transpileModule({ entryFile, fs, unsupportedValues: "omit" }),
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
    });

    it("keeps plain CMX-looking objects and arrays in props as data", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]:
          "export default <div payload={{ type: 'element', tag: 'fake', list: [{ type: 'fragment' }, 1, 'x'] }} />;",
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "div",
        props: {
          payload: {
            type: "element",
            tag: "fake",
            list: [{ type: "fragment" }, 1, "x"],
          },
        },
      });
    });

    it("emits inline prop-relative slots for runtime JSX nodes in props only", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "const hero = <em>Hero</em>;",
          "const nested = [{ deep: <strong>Strong</strong> }];",
          "export default <article slot={hero} data={{ nested }}><p>Child</p></article>;",
        ].join("\n"),
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "article",
        props: {
          slot: {
            type: "element",
            tag: "em",
            children: ["Hero"],
          },
          data: {
            nested: [
              {
                deep: {
                  type: "element",
                  tag: "strong",
                  children: ["Strong"],
                },
              },
            ],
          },
        },
        slots: [["slot"], ["data", "nested", 0, "deep"]],
        children: [
          {
            type: "element",
            tag: "p",
            children: ["Child"],
          },
        ],
      });
    });

    it("keeps CMX-shaped plain objects in props as data unless runtime-created", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "const fake = { __cmxRuntimeNode: true, kind: 'element', tag: 'fake' };",
          "export default <div payload={fake} />;",
        ].join("\n"),
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "div",
        props: {
          payload: {
            __cmxRuntimeNode: true,
            kind: "element",
            tag: "fake",
          },
        },
      });
    });

    it("keeps JSON-cloned runtime-shaped objects in props as data", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "const runtimeNode = <mark>runtime</mark>;",
          "const cloned = JSON.parse(JSON.stringify(runtimeNode));",
          "export default <div payload={cloned} />;",
        ].join("\n"),
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "div",
        props: {
          payload: {
            kind: "element",
            tag: "mark",
            children: ["runtime"],
          },
        },
      });
    });

    it("returns error diagnostics for missing virtual import", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { Missing } from './missing';",
          "export default <main><Missing /></main>;",
        ].join("\n"),
      });

      const result = expectErrorResult(
        await transpileModule({ entryFile, fs }),
      );

      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]?.code).toBe(ErrorCode.UNEXPECTED);
      expect(result.diagnostics[0]?.message).toMatch(
        /Virtual module not found: \.\/missing/u,
      );
    });

    it("normalizes root arrays to fragment nodes", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]:
          "export default [<h1 key='a'>A</h1>, <h2 key='b'>B</h2>, 'tail'];",
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

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
          "tail",
        ],
      });
    });

    it("flattens nested child arrays recursively", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "const chunks = [",
          "  ['before', ['mid']],",
          "  [[[<strong key='deep'>deep</strong>]]],",
          "  'after',",
          "];",
          "export default <p>{chunks}</p>;",
        ].join("\n"),
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "p",
        children: [
          "before",
          "mid",
          {
            type: "element",
            tag: "strong",
            children: ["deep"],
          },
          "after",
        ],
      });
    });

    it("omits JSX comments from children output", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "export default <section>",
          "  alpha",
          "  {/* hidden note */}",
          "  beta",
          "</section>;",
        ].join("\n"),
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "section",
        children: ["alpha", "beta"],
      });
    });

    it("preserves adjacent text boundaries without merging", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]:
          "export default <p>hello{' '}world{''}!</p>;",
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "p",
        children: ["hello", " ", "world", "", "!"],
      });
    });
  });

  describe("result envelope stability", () => {
    it("keeps success envelope stable for future behavior tickets", async () => {
      const result = await transpileModule({
        entryFile: "/virtual/entry.tsx",
        fs: createVirtualFs({
          "/virtual/entry.tsx": "export default <article>ok</article>;",
        }),
      });

      expect(result.kind).toBe("success");
      expect(result).toHaveProperty("tree");
      expect(result).toHaveProperty("manifest");
      expect(result).not.toHaveProperty("meta");
      expect(result).toHaveProperty("diagnostics");
    });

    it("keeps error envelope stable for future behavior tickets", async () => {
      const result = await transpileModule({
        entryFile: "/virtual/entry.tsx",
        fs: createVirtualFs({
          "/virtual/entry.tsx": "export default () => undefined;",
        }),
      });

      expect(result.kind).toBe("error");
      expect(result).toHaveProperty("diagnostics");
      expect(result).not.toHaveProperty("tree");
      expect(result).not.toHaveProperty("manifest");
      expect(result).not.toHaveProperty("meta");
      expect(result.diagnostics).toMatchInlineSnapshot(`
        [
          {
            "code": "undefined-value",
            "message": "default export resolved to undefined",
          },
        ]
      `);
    });
  });

  describe("async component support", () => {
    it("awaits async default export function", async () => {
      const result = expectTreeResult(
        await transpileModule({
          entryFile: "/virtual/async-default.tsx",
          fs: createVirtualFs({
            "/virtual/async-default.tsx":
              "export default async function Page() { return <main>ok</main>; }",
          }),
        }),
      );

      expect(result.tree).toEqual({
        type: "element",
        tag: "main",
        children: ["ok"],
      });
      expect(result.diagnostics).toEqual([]);
    });

    it("awaits async local components in JSX tree", async () => {
      const result = expectTreeResult(
        await transpileModule({
          entryFile: "/virtual/async-component.tsx",
          fs: createVirtualFs({
            "/virtual/async-component.tsx": [
              "async function AsyncBlock() { return <p>later</p>; }",
              "export default <main><AsyncBlock /></main>;",
            ].join("\n"),
          }),
        }),
      );

      expect(result.tree).toEqual({
        type: "element",
        tag: "main",
        children: [
          {
            type: "element",
            tag: "p",
            children: ["later"],
          },
        ],
      });
      expect(result.diagnostics).toEqual([]);
    });

    it("preserves order for mixed sync and async child composition", async () => {
      const result = expectTreeResult(
        await transpileModule({
          entryFile: "/virtual/async-mixed.tsx",
          fs: createVirtualFs({
            "/virtual/async-mixed.tsx": [
              "async function AsyncLeaf({ label }: { label: string }) { return <li>{label}</li>; }",
              "function SyncLeaf() { return <li>sync</li>; }",
              "async function AsyncGroup() {",
              "  return [<AsyncLeaf label='a' />, [<SyncLeaf />, 'tail']];",
              "}",
              "export default <ul><AsyncGroup /><AsyncLeaf label='b' /></ul>;",
            ].join("\n"),
          }),
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
      expect(result.diagnostics).toEqual([]);
    });

    it("keeps invalid-output diagnostics after awaiting async components", async () => {
      const result = expectErrorResult(
        await transpileModule({
          entryFile: "/virtual/async-undefined-child.tsx",
          fs: createVirtualFs({
            "/virtual/async-undefined-child.tsx": [
              "async function AsyncBlock() { return undefined; }",
              "export default <main><AsyncBlock /></main>;",
            ].join("\n"),
          }),
        }),
      );

      expect(result.diagnostics).toEqual([
        {
          code: ErrorCode.UNDEFINED_VALUE,
          message: "default export.children[0] resolved to undefined",
        },
      ]);
    });
  });

  describe("primitive roots and invalid node diagnostics", () => {
    it("supports null, boolean, string, and number as root nodes", async () => {
      const nullResult = expectTreeResult(
        await transpileModule({
          entryFile: "/virtual/null.tsx",
          fs: createVirtualFs({
            "/virtual/null.tsx": "export default null;",
          }),
        }),
      );
      expect(nullResult.tree).toBeNull();

      const booleanResult = expectTreeResult(
        await transpileModule({
          entryFile: "/virtual/boolean.tsx",
          fs: createVirtualFs({
            "/virtual/boolean.tsx": "export default true;",
          }),
        }),
      );
      expect(booleanResult.tree).toBe(true);

      const stringResult = expectTreeResult(
        await transpileModule({
          entryFile: "/virtual/string.tsx",
          fs: createVirtualFs({
            "/virtual/string.tsx": "export default 'hello';",
          }),
        }),
      );
      expect(stringResult.tree).toBe("hello");

      const numberResult = expectTreeResult(
        await transpileModule({
          entryFile: "/virtual/number.tsx",
          fs: createVirtualFs({
            "/virtual/number.tsx": "export default 42;",
          }),
        }),
      );
      expect(numberResult.tree).toBe(42);
    });

    it("preserves null and booleans in fragment children", async () => {
      const result = expectTreeResult(
        await transpileModule({
          entryFile: "/virtual/null-boolean-children.tsx",
          fs: createVirtualFs({
            "/virtual/null-boolean-children.tsx":
              "export default <>{null}{false}{true}</>;",
          }),
        }),
      );

      expect(result.tree).toEqual({
        type: "fragment",
        children: [null, false, true],
      });
    });

    it("returns error when root resolves to plain object", async () => {
      const result = expectErrorResult(
        await transpileModule({
          entryFile: "/virtual/root-object.tsx",
          fs: createVirtualFs({
            "/virtual/root-object.tsx": "export default { hello: 'world' };",
          }),
        }),
      );

      expect(result.diagnostics).toMatchInlineSnapshot(`
        [
          {
            "code": "invalid-runtime-output",
            "message": "default export is not CMX runtime output",
          },
        ]
      `);
    });

    it("returns error when child resolves to undefined", async () => {
      const result = expectErrorResult(
        await transpileModule({
          entryFile: "/virtual/undefined-child.tsx",
          fs: createVirtualFs({
            "/virtual/undefined-child.tsx":
              "export default <article>{undefined}</article>;",
          }),
        }),
      );

      expect(result.diagnostics).toMatchInlineSnapshot(`
        [
          {
            "code": "undefined-value",
            "message": "default export.children[0] resolved to undefined",
          },
        ]
      `);
    });

    it("returns error when child resolves to plain object", async () => {
      const result = expectErrorResult(
        await transpileModule({
          entryFile: "/virtual/object-child.tsx",
          fs: createVirtualFs({
            "/virtual/object-child.tsx":
              "export default <article>{{ hello: 'world' }}</article>;",
          }),
        }),
      );

      expect(result.diagnostics).toMatchInlineSnapshot(`
        [
          {
            "code": "invalid-runtime-output",
            "message": "default export.children[0] is not CMX runtime output",
          },
        ]
      `);
    });
  });

  describe("external modules become unresolved CMX component refs", () => {
    it("rejects external imports used as meta runtime values", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { themeName } from '@theme/ui';",
          "export const meta = themeName;",
          "export default <p>ok</p>;",
        ].join("\n"),
      });

      const result = expectErrorResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/ui"],
        }),
      );

      expect(result.diagnostics[0]).toEqual({
        code: ErrorCode.EXTERNAL_RUNTIME_VALUE,
        message: "External import used as runtime value.",
      });
    });

    it("emits component node + manifest for named external alias", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { H1 as Heading } from '@theme/ui';",
          "export default <Heading tone='strong'>Hello</Heading>;",
        ].join("\n"),
      });

      const result = expectTreeResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/ui"],
        }),
      );

      expect(result.tree).toEqual({
        type: "component",
        from: "@theme/ui",
        import: "H1",
        props: {
          tone: "strong",
        },
        children: ["Hello"],
      });
      expect(result.manifest).toEqual({
        externals: [
          {
            from: "@theme/ui",
            imports: ["H1"],
          },
        ],
      });
      expect(result.diagnostics).toEqual([]);
    });

    it("maps explicit children prop on external component to node children", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { H1 } from '@theme/ui';",
          "export default <H1 children='From prop' />;",
        ].join("\n"),
      });

      const result = expectTreeResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/ui"],
        }),
      );

      expect(result.tree).toEqual({
        type: "component",
        from: "@theme/ui",
        import: "H1",
        children: ["From prop"],
      });
      expect(result.manifest).toEqual({
        externals: [
          {
            from: "@theme/ui",
            imports: ["H1"],
          },
        ],
      });
    });

    it("prefers JSX child over explicit children prop on external component", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { H1 } from '@theme/ui';",
          "export default <H1 children='From prop'>From JSX</H1>;",
        ].join("\n"),
      });

      const result = expectTreeResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/ui"],
        }),
      );

      expect(result.tree).toEqual({
        type: "component",
        from: "@theme/ui",
        import: "H1",
        children: ["From JSX"],
      });
      expect(result.manifest).toEqual({
        externals: [
          {
            from: "@theme/ui",
            imports: ["H1"],
          },
        ],
      });
    });

    it("supports default + named externals and merges manifest refs", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import Hero, { H1 as Heading } from '@theme/ui';",
          "export default <Hero><Heading>Hello</Heading></Hero>;",
        ].join("\n"),
      });

      const result = expectTreeResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/ui"],
        }),
      );

      expect(result.tree).toEqual({
        type: "component",
        from: "@theme/ui",
        children: [
          {
            type: "component",
            from: "@theme/ui",
            import: "H1",
            children: ["Hello"],
          },
        ],
      });
      expect(result.manifest).toEqual({
        externals: [
          {
            from: "@theme/ui",
            default: true,
            imports: ["H1"],
          },
        ],
      });
      expect(result.diagnostics).toEqual([]);
    });

    it("matches externals after module resolution using canonical module ids", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { Hero } from './external/hero';",
          "export default <main><Hero title='Canonical' /></main>;",
        ].join("\n"),
        "/virtual/external/hero.tsx":
          "export function Hero({ title }: { title: string }) { return <h1>{title}</h1>; }",
      });

      const result = expectTreeResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["/virtual/external"],
        }),
      );

      expect(result.tree).toEqual({
        type: "element",
        tag: "main",
        children: [
          {
            type: "component",
            from: "/virtual/external/hero.tsx",
            import: "Hero",
            props: {
              title: "Canonical",
            },
          },
        ],
      });
      expect(result.manifest).toEqual({
        externals: [
          {
            from: "/virtual/external/hero.tsx",
            imports: ["Hero"],
          },
        ],
      });
      expect(result.diagnostics).toEqual([]);
    });

    it("supports /** suffix for deep package path matches", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { Button } from '@theme/ui/button';",
          "export default <Button size='lg'>Go</Button>;",
        ].join("\n"),
      });

      const result = expectTreeResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/**"],
        }),
      );

      expect(result.tree).toEqual({
        type: "component",
        from: "@theme/ui/button",
        import: "Button",
        props: {
          size: "lg",
        },
        children: ["Go"],
      });
      expect(result.manifest).toEqual({
        externals: [
          {
            from: "@theme/ui/button",
            imports: ["Button"],
          },
        ],
      });
    });

    it("supports /* suffix for one-segment package path matches only", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { Button } from '@theme/ui/button';",
          "export default <Button />;",
        ].join("\n"),
      });

      const result = expectErrorResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/*"],
        }),
      );

      expect(result.diagnostics[0]?.code).toBe(ErrorCode.UNEXPECTED);
      expect(result.diagnostics[0]?.message).toMatch(/Could not resolve/u);
    });

    it("sorts manifest refs deterministically by module + named import", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { zeta as Zeta, alpha as AlphaB } from '@vendor/b';",
          "import { zebra as ZebraA, alpha as AlphaA } from '@vendor/a';",
          "export default <main><AlphaA /><Zeta /><ZebraA /><AlphaB /></main>;",
        ].join("\n"),
      });

      const result = expectTreeResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@vendor/a", "@vendor/b"],
        }),
      );

      expect(result.manifest).toEqual({
        externals: [
          {
            from: "@vendor/a",
            imports: ["alpha", "zebra"],
          },
          {
            from: "@vendor/b",
            imports: ["alpha", "zeta"],
          },
        ],
      });
    });

    it("records only external refs used in output", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { Used } from '@vendor/ui';",
          "import { Unused } from '@vendor/ui';",
          "export default <Used />;",
        ].join("\n"),
      });

      const result = expectTreeResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@vendor/ui"],
        }),
      );

      expect(result.manifest).toEqual({
        externals: [
          {
            from: "@vendor/ui",
            imports: ["Used"],
          },
        ],
      });
    });

    it("rejects namespace imports from externals with stable diagnostic code", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import * as UI from '@theme/ui';",
          "export default <UI.H1 />;",
        ].join("\n"),
      });

      const result = expectErrorResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/ui"],
        }),
      );

      expect(result.diagnostics[0]).toEqual({
        code: ErrorCode.NAMESPACE_IMPORT_UNSUPPORTED,
        message: "Namespace imports are not supported for externals",
      });
    });

    it("rejects external components called as functions with stable diagnostic code", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { H1 } from '@theme/ui';",
          "export default H1({ children: 'Hello' });",
        ].join("\n"),
      });

      const result = expectErrorResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/ui"],
        }),
      );

      expect(result.diagnostics[0]).toEqual({
        code: ErrorCode.EXTERNAL_COMPONENT_CALLED,
        message: "External component must be used as JSX.",
      });
    });

    it("rejects external imports used as runtime values with stable diagnostic code", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { themeName } from '@theme/ui';",
          "export default <p>{themeName}</p>;",
        ].join("\n"),
      });

      const result = expectErrorResult(
        await transpileModule({
          entryFile,
          fs,
          externals: ["@theme/ui"],
        }),
      );

      expect(result.diagnostics[0]).toEqual({
        code: ErrorCode.EXTERNAL_RUNTIME_VALUE,
        message: "External import used as runtime value.",
      });
    });
  });

  describe("diagnostic code contract coverage", () => {
    it("returns unsupported jsx element type error code for invalid jsx runtime type", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: [
          "import { jsx } from 'cmx-internal/jsx-runtime';",
          "export default jsx(123 as unknown as string, {});",
        ].join("\n"),
      });

      const result = expectErrorResult(
        await transpileModule({
          entryFile,
          fs,
        }),
      );

      expect(result.diagnostics[0]).toEqual({
        code: ErrorCode.UNSUPPORTED_JSX_ELEMENT_TYPE,
        message: "Unsupported JSX element type.",
      });
    });

    it("returns build no output error code when esbuild emits no output file", async () => {
      vi.resetModules();
      vi.doMock("esbuild", () => ({
        build: vi.fn().mockResolvedValue({ outputFiles: [] }),
      }));

      try {
        const { transpileModule: mockedTranspileModule } = await import(
          "../src/transpile-module/index.js"
        );
        const result = expectErrorResult(
          await mockedTranspileModule({
            entryFile: "/virtual/entry.tsx",
          }),
        );

        expect(result.diagnostics[0]).toEqual({
          code: ErrorCode.BUILD_NO_OUTPUT,
          message: "esbuild did not emit output",
        });
      } finally {
        vi.doUnmock("esbuild");
        vi.resetModules();
      }
    });
  });

  describe("children semantics baseline", () => {
    it("maps explicit children prop on intrinsic element to node children", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: "export default <p children='From prop' />;",
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "p",
        children: ["From prop"],
      });
    });

    it("prefers JSX child over explicit children prop on intrinsic element", async () => {
      const entryFile = "/virtual/entry.tsx";
      const fs = createVirtualFs({
        [entryFile]: "export default <p children='From prop'>From JSX</p>;",
      });

      const result = expectTreeResult(await transpileModule({ entryFile, fs }));

      expect(result.tree).toEqual({
        type: "element",
        tag: "p",
        children: ["From JSX"],
      });
    });
  });
});
