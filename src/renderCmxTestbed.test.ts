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
