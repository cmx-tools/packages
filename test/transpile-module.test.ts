import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type {
  FileSystem,
  TranspileErrorResult,
  TranspileModuleResult,
  TranspileSuccessResult,
} from "../src/transpile-module.js";
import { transpileModule } from "../src/transpile-module.js";

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
          "entry.tsx": [
            "import { Hero } from './helper';",
            "export const meta = { slug: 'hello-world' };",
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
        expect(result.meta).toEqual({ slug: "hello-world" });
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
        expect(result.diagnostics[0]?.message).toMatch(
          /has no default export/u,
        );
      });
    });
  });

  describe("source-to-output contract (virtual fs)", () => {
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
      expect(result.meta).toEqual({ slug: "virtual" });
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

      expect(result.diagnostics).toMatchInlineSnapshot(`
        [
          {
            "message": "Unsupported prop value at default export.props.onClick",
          },
        ]
      `);
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
      expect(result).toHaveProperty("meta");
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
            "message": "default export resolved to undefined",
          },
        ]
      `);
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
            "message": "default export.children[0] is not CMX runtime output",
          },
        ]
      `);
    });
  });
});
