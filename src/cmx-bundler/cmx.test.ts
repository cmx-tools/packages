import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";
import { cmx, type CmxArtifact } from "./cmx.js";

type CmxWarning = {
  pluginCode?: unknown;
  message: string;
  loc?: {
    file?: string;
    line: number;
    column: number;
  };
};

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

async function readArtifact(outDir: string): Promise<CmxArtifact> {
  return JSON.parse(
    await readFile(path.join(outDir, "cmx-artifact.json"), "utf8"),
  ) as CmxArtifact;
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

  it("emits a multi-entry artifact with code-split chunk metadata", async () => {
    await withTempDir(async (tempDir) => {
      const homeFile = await writeFixture(
        tempDir,
        "home.tsx",
        [
          'import { label } from "./shared";',
          "export default <main>Home {label}</main>;",
        ].join("\n"),
      );
      const aboutFile = await writeFixture(
        tempDir,
        "about.tsx",
        [
          'import { label } from "./shared";',
          "export default <main>About {label}</main>;",
        ].join("\n"),
      );
      await writeFixture(
        tempDir,
        "shared.ts",
        [
          "const state = globalThis as typeof globalThis & { __cmxSharedLoads?: number };",
          "state.__cmxSharedLoads = (state.__cmxSharedLoads ?? 0) + 1;",
          "export const label = state.__cmxSharedLoads;",
        ].join("\n"),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: {
          home: homeFile,
          about: aboutFile,
        },
        plugins: [cmx()],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "[name].js",
          chunkFileNames: "[name]-[hash].js",
        });

        const artifact = await readArtifact(outDir);
        expect(artifact.runtime).toEqual({
          importSource: "@cmx/runtime",
        });
        expect(artifact.entries).toEqual([
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
        expect(artifact.chunks).toEqual(
          expect.arrayContaining([
            {
              file: "home.js",
              sourcemap: "home.js.map",
              isEntry: true,
            },
            {
              file: "about.js",
              sourcemap: "about.js.map",
              isEntry: true,
            },
            {
              file: expect.stringMatching(/^shared-.*\.js$/u),
              sourcemap: expect.stringMatching(/^shared-.*\.js\.map$/u),
              isEntry: false,
            },
          ]),
        );
        for (const chunk of artifact.chunks) {
          await expect(
            readFile(path.join(outDir, chunk.file), "utf8"),
          ).resolves.toBeDefined();
          await expect(
            readFile(path.join(outDir, chunk.sourcemap), "utf8"),
          ).resolves.toContain(".ts");
        }
      } finally {
        await bundle.close();
      }
    });
  });

  it("rejects dynamic imports during artifact emission", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          "export default async function Page() {",
          "  await import('./other');",
          "  return <main />;",
          "}",
        ].join("\n"),
      );
      await writeFixture(tempDir, "other.ts", "export const value = 1;\n");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx()],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).rejects.toMatchObject({
          errors: [
            {
              pluginCode: "dynamic-import-unsupported",
            },
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });

  it("emits configured external component stubs without bundling the external package", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import HeroDefault, { Hero as PageHero } from "@theme/ui";',
          "export default <><HeroDefault /><PageHero /></>;",
        ].join("\n"),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx({ externals: ["@theme/ui"] })],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });

        const artifact = await readArtifact(outDir);
        expect(artifact.entries).toEqual([
          {
            name: "entry",
            file: "entry.js",
            sourcemap: "entry.js.map",
          },
        ]);
        await expect(
          readFile(path.join(outDir, "entry.js"), "utf8"),
        ).resolves.toEqual(expect.not.stringContaining('from "@theme/ui"'));
        await expect(
          readFile(path.join(outDir, "entry.js"), "utf8"),
        ).resolves.toContain("__registerExternal");
        await expect(
          readFile(path.join(outDir, "entry.js"), "utf8"),
        ).resolves.toContain('const __cmxFrom = "@theme/ui";');
        await expect(
          readFile(path.join(outDir, "entry.js"), "utf8"),
        ).resolves.toContain('import: "Hero"');
      } finally {
        await bundle.close();
      }
    });
  });

  it("extracts only narrow external meta type references into entry metadata", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import type { PageMeta, ComplexMeta } from "@theme/content";',
          "export const meta: PageMeta = { title: 'Hello' };",
          "export const ignored: ComplexMeta<{ title: string }> = { title: 'No' };",
          "export default <main>Hello</main>;",
        ].join("\n"),
      );
      const genericFile = await writeFixture(
        tempDir,
        "generic.tsx",
        [
          'import type { PageMeta } from "@theme/content";',
          "export const meta: PageMeta<{ title: string }> = { title: 'No' };",
          "export default <main>No</main>;",
        ].join("\n"),
      );
      const localFile = await writeFixture(
        tempDir,
        "local.tsx",
        [
          'import type { PageMeta } from "./types";',
          "export const meta: PageMeta = { title: 'Local' };",
          "export default <main>Local</main>;",
        ].join("\n"),
      );
      await writeFixture(
        tempDir,
        "types.ts",
        "export type PageMeta = { title: string };\n",
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: {
          entry: entryFile,
          generic: genericFile,
          local: localFile,
        },
        plugins: [cmx()],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "[name].js",
        });

        await expect(readArtifact(outDir)).resolves.toMatchObject({
          entries: [
            {
              name: "entry",
              meta: {
                type: {
                  from: "@theme/content",
                  import: "PageMeta",
                },
              },
            },
            {
              name: "generic",
            },
            {
              name: "local",
            },
          ],
        });
        const artifact = await readArtifact(outDir);
        expect(artifact.entries[1]).not.toHaveProperty("meta");
        expect(artifact.entries[2]).not.toHaveProperty("meta");
      } finally {
        await bundle.close();
      }
    });
  });

  it("warns for exported meta annotations that cannot become metadata", async () => {
    await withTempDir(async (tempDir) => {
      const unresolvedFile = await writeFixture(
        tempDir,
        "unresolved.tsx",
        [
          "export const meta: PageMeta = { title: 'Missing' };",
          "export default <main>Missing</main>;",
        ].join("\n"),
      );
      const localAliasFile = await writeFixture(
        tempDir,
        "local-alias.tsx",
        [
          "type PageMeta = { title: string };",
          "export const meta: PageMeta = { title: 'Local' };",
          "export default <main>Local</main>;",
        ].join("\n"),
      );
      const namespaceFile = await writeFixture(
        tempDir,
        "namespace.tsx",
        [
          'import type * as Theme from "@theme/content";',
          "export const meta: Theme.PageMeta = { title: 'Namespace' };",
          "export default <main>Namespace</main>;",
        ].join("\n"),
      );
      const genericFile = await writeFixture(
        tempDir,
        "generic.tsx",
        [
          'import type { PageMeta } from "@theme/content";',
          "export const meta: PageMeta<{ title: string }> = { title: 'Generic' };",
          "export default <main>Generic</main>;",
        ].join("\n"),
      );
      const localSourceFile = await writeFixture(
        tempDir,
        "local-source.tsx",
        [
          'import type { PageMeta } from "./types";',
          "export const meta: PageMeta = { title: 'Local source' };",
          "export default <main>Local source</main>;",
        ].join("\n"),
      );
      await writeFixture(
        tempDir,
        "types.ts",
        "export type PageMeta = { title: string };\n",
      );
      const warnings: CmxWarning[] = [];
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: {
          unresolved: unresolvedFile,
          localAlias: localAliasFile,
          namespace: namespaceFile,
          generic: genericFile,
          localSource: localSourceFile,
        },
        onwarn(warning) {
          warnings.push(warning);
        },
        plugins: [cmx()],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "[name].js",
        });

        expect(warnings).toHaveLength(5);
        expect(warnings).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              pluginCode: "meta-type-unsupported",
              message:
                "CMX meta.type could not be extracted. Use a simple type-only import from an external package for exported meta annotations.",
              loc: {
                file: unresolvedFile,
                line: 1,
                column: 19,
              },
            }),
            expect.objectContaining({
              pluginCode: "meta-type-unsupported",
              loc: {
                file: localAliasFile,
                line: 2,
                column: 19,
              },
            }),
            expect.objectContaining({
              pluginCode: "meta-type-unsupported",
              loc: {
                file: namespaceFile,
                line: 2,
                column: 19,
              },
            }),
            expect.objectContaining({
              pluginCode: "meta-type-unsupported",
              loc: {
                file: genericFile,
                line: 2,
                column: 19,
              },
            }),
            expect.objectContaining({
              pluginCode: "meta-type-unsupported",
              loc: {
                file: localSourceFile,
                line: 2,
                column: 19,
              },
            }),
          ]),
        );
        const artifact = await readArtifact(outDir);
        for (const entry of artifact.entries) {
          expect(entry).not.toHaveProperty("meta");
        }
      } finally {
        await bundle.close();
      }
    });
  });

  it("does not warn when exported meta has no type annotation", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          "export const meta = { title: 'Hello' };",
          "export default <main>Hello</main>;",
        ].join("\n"),
      );
      const warnings: CmxWarning[] = [];
      const bundle = await rolldown({
        input: entryFile,
        onwarn(warning) {
          warnings.push(warning);
        },
        plugins: [cmx()],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).resolves.toBeDefined();
        expect(warnings).toEqual([]);
      } finally {
        await bundle.close();
      }
    });
  });

  it("fails for unsupported exported meta annotations in strict mode", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          "type PageMeta = { title: string };",
          "export const meta: PageMeta = { title: 'Local' };",
          "export default <main>Local</main>;",
        ].join("\n"),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx({ onUnresolvedMetaType: "error" })],
      });

      try {
        await expect(
          bundle.write({
            dir: outDir,
            entryFileNames: "entry.js",
          }),
        ).rejects.toMatchObject({
          errors: [
            {
              pluginCode: "meta-type-unsupported",
              loc: {
                file: entryFile,
                line: 2,
                column: 19,
              },
            },
          ],
        });
        await expect(
          readFile(path.join(outDir, "cmx-artifact.json"), "utf8"),
        ).rejects.toMatchObject({ code: "ENOENT" });
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
