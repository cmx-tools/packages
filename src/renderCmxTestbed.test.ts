import { describe, expect, it } from "vitest";
import { renderCmxTestbed } from "./renderCmxTestbed.js";

describe("renderCmxTestbed", () => {
  it("builds a TSX source fixture through the artifact boundary and renders CMX", async () => {
    await expect(
      renderCmxTestbed({
        files: {
          "entry.tsx": "export default <main>Hello</main>;\n",
        },
      }),
    ).resolves.toMatchObject({
      tree: {
        type: "element",
        tag: "main",
        children: ["Hello"],
      },
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
});
