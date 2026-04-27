import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";
import { cmx } from "./cmx.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundler-"));
  await run(tempDir);
}

async function writeFixture(
  rootDir: string,
  relativePath: string,
  source: string,
): Promise<string> {
  const absolutePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source, "utf8");
  return absolutePath;
}

describe("cmx", () => {
  it("emits ESM, external sourcemap, and minimal CMX artifact for TSX entry", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        "export default <main>Hello</main>;\n",
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx()],
      });

      try {
        const output = await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });

        const outputFiles = output.output.map((item) => item.fileName).sort();

        expect(outputFiles).toEqual([
          "cmx-artifact.json",
          "entry.js",
          "entry.js.map",
        ]);
        await expect(
          readFile(path.join(outDir, "entry.js.map"), "utf8"),
        ).resolves.toContain("entry.tsx");
        await expect(
          readFile(path.join(outDir, "entry.js"), "utf8"),
        ).resolves.toContain('from "@cmx/runtime/jsx-runtime"');
        await expect(
          readFile(path.join(outDir, "cmx-artifact.json"), "utf8").then(
            (source) => JSON.parse(source) as unknown,
          ),
        ).resolves.toEqual({
          runtime: {
            importSource: "@cmx/runtime",
          },
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
            },
          ],
          chunks: [
            {
              file: "entry.js",
              sourcemap: "entry.js.map",
              isEntry: true,
            },
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });

  it("does not execute content while emitting the artifact", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          "export default <main>Hello</main>;",
          "throw new Error('content executed during build');",
        ].join("\n"),
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx()],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: false }),
        ).resolves.toBeDefined();
      } finally {
        await bundle.close();
      }
    });
  });

  it("allows local bindings that shadow configured external imports", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import { H1 } from "@theme/ui";',
          "function renderLocal(H1: () => string) {",
          "  return H1();",
          "}",
          "export default <main>{renderLocal(() => 'Hello')}</main>;",
        ].join("\n"),
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx({ externals: ["@theme/ui"] })],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).resolves.toBeDefined();
      } finally {
        await bundle.close();
      }
    });
  });

  it("allows configured external imports in type-only references", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import { Button } from "@theme/ui";',
          "type Props = { button: typeof Button };",
          "export const meta: { props?: Props } = {};",
          "export default <Button />;",
        ].join("\n"),
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx({ externals: ["@theme/ui"] })],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).resolves.toBeDefined();
      } finally {
        await bundle.close();
      }
    });
  });

  it("rejects configured external imports used as runtime values", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import { themeName } from "@theme/ui";',
          "export default <main>{themeName}</main>;",
        ].join("\n"),
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx({ externals: ["@theme/ui"] })],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).rejects.toMatchObject({
          errors: [
            {
              pluginCode: "external-runtime-value-unsupported",
            },
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });
});
