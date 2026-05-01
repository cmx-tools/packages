import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";
import {
  CMX_BUNDLE_FILE_NAME,
  parseCmxBundleJson,
  type CmxBundle,
} from "cmx-bundle";
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

async function readBundle(outDir: string): Promise<CmxBundle> {
  return parseCmxBundleJson(
    await readFile(path.join(outDir, CMX_BUNDLE_FILE_NAME), "utf8"),
  );
}

describe("cmx", () => {
  it("emits ESM, external sourcemap, and minimal CMX bundle for TSX entry", async () => {
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
          CMX_BUNDLE_FILE_NAME,
          "entry.js",
          "entry.js.map",
        ]);
        await expect(
          readFile(path.join(outDir, "entry.js.map"), "utf8"),
        ).resolves.toContain("entry.tsx");
        await expect(
          readFile(path.join(outDir, "entry.js"), "utf8"),
        ).resolves.toContain('from "cmx-runtime/jsx-runtime"');
        await expect(
          readFile(path.join(outDir, "cmx-bundle.json"), "utf8").then(
            (source) => JSON.parse(source) as unknown,
          ),
        ).resolves.toEqual({
          version: 1,
          runtime: {
            importSource: "cmx-runtime",
          },
          dependencies: [],
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

  it("does not execute content while emitting the bundle", async () => {
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

  it("emits a multi-entry bundle with code-split chunk metadata", async () => {
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

        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.runtime).toEqual({
          importSource: "cmx-runtime",
        });
        expect(cmxBundle.dependencies).toEqual([]);
        expect(cmxBundle.entries).toHaveLength(2);
        expect(cmxBundle.entries).toEqual(
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
        expect(cmxBundle.chunks).toEqual(
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
        for (const chunk of cmxBundle.chunks) {
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

  it("rejects dynamic imports during bundle emission", async () => {
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

        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.entries).toEqual([
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

  it("extracts narrow external PageMeta into entry metadata", async () => {
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
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx()],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });

        await expect(readBundle(outDir)).resolves.toMatchObject({
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
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });

  it("ignores non-entry exported meta annotations", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import { label } from "./helper";',
          "export const meta = { title: 'Entry' };",
          "export default <main>{label}</main>;",
        ].join("\n"),
      );
      await writeFixture(
        tempDir,
        "helper.ts",
        [
          "type HelperMeta<T> = { local: T };",
          "export const meta: HelperMeta<{ label: string }> = { local: { label: 'Helper' } };",
          "export const label = meta.local.label;",
        ].join("\n"),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx()],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });

        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.entries).toEqual([
          {
            name: "entry",
            file: "entry.js",
            sourcemap: "entry.js.map",
          },
        ]);
      } finally {
        await bundle.close();
      }
    });
  });

  it("omits meta.type for non-extractable entries when unsupportedMetaTypes is omit", async () => {
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
        plugins: [cmx({ unsupportedMetaTypes: "omit" })],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "[name].js",
        });

        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.entries).toHaveLength(3);
        expect(cmxBundle.entries).toEqual(
          expect.arrayContaining([
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
              meta: {
                type: {
                  from: "@theme/content",
                  import: "PageMeta",
                },
              },
            },
            {
              name: "generic",
              file: "generic.js",
              sourcemap: "generic.js.map",
            },
            {
              name: "local",
              file: "local.js",
              sourcemap: "local.js.map",
            },
          ]),
        );
        const genericEntry = cmxBundle.entries.find(
          (entry) => entry.name === "generic",
        );
        const localEntry = cmxBundle.entries.find(
          (entry) => entry.name === "local",
        );
        expect(genericEntry).toBeDefined();
        expect(localEntry).toBeDefined();
        expect(genericEntry).not.toHaveProperty("meta");
        expect(localEntry).not.toHaveProperty("meta");
      } finally {
        await bundle.close();
      }
    });
  });

  it("rejects unsupported exported meta type extraction by default", async () => {
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
        plugins: [cmx()],
      });

      try {
        await expect(
          bundle.write({
            dir: outDir,
            entryFileNames: "entry.js",
          }),
        ).rejects.toMatchObject({
          errors: [
            expect.objectContaining({
              pluginCode: "meta-type-unsupported",
              loc: expect.objectContaining({
                line: 2,
                column: 19,
              }),
            }),
          ],
        });
        await expect(
          readFile(path.join(outDir, "cmx-bundle.json"), "utf8"),
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
          "export type { Props };",
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
