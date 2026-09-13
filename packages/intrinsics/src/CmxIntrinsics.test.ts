import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { expect, it } from "vitest";

it.each(["react-jsx", "react-jsxdev"])(
  "checks and executes a bare Content Project with %s and no DOM or React types",
  (jsx) => {
    const project = fileURLToPath(
      new URL("./authoring-fixtures/tsconfig.json", import.meta.url),
    );
    const packageRoot = fileURLToPath(new URL("../", import.meta.url));
    const output = mkdtempSync(join(packageRoot, ".authoring-"));

    try {
      const compilation = spawnSync(
        "corepack",
        [
          "pnpm",
          "exec",
          "tsgo",
          "-p",
          project,
          "--jsx",
          jsx,
          "--noEmit",
          "false",
          "--outDir",
          output,
        ],
        { encoding: "utf8", stdio: "pipe", timeout: 30_000 },
      );
      expect(
        compilation.status,
        compilation.error?.message ?? compilation.stdout + compilation.stderr,
      ).toBe(0);

      const contentUrl = pathToFileURL(join(output, "published-content.js"));
      const execution = spawnSync(
        process.execPath,
        [
          "--input-type=module",
          "--eval",
          `import { isRuntimeNode } from "@cmx-tools/runtime";
           const { content } = await import(${JSON.stringify(contentUrl.href)});
           console.log(JSON.stringify({ branded: isRuntimeNode(content), content }));`,
        ],
        { cwd: packageRoot, encoding: "utf8", timeout: 10_000 },
      );
      expect(
        execution.status,
        execution.error?.message ?? execution.stderr,
      ).toBe(0);
      expect(JSON.parse(execution.stdout)).toEqual({
        branded: true,
        content: {
          kind: "element",
          tag: "article",
          props: { class: "coffee" },
          children: [
            { kind: "element", tag: "h1", children: ["Fresh coffee"] },
            { kind: "element", tag: "strong", children: ["12 EUR"] },
            {
              kind: "element",
              tag: "svg",
              props: { viewBox: "0 0 20 20" },
              children: [
                {
                  kind: "element",
                  tag: "path",
                  props: { d: "M2 10h16", strokeWidth: 2 },
                },
              ],
            },
          ],
        },
      });
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  },
);
