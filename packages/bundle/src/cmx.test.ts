import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { rolldown } from "rolldown";
import { describe, expect, it } from "vitest";
import {
  CMX_BUNDLE_FILE_NAME,
  CmxConfig,
  parseCmxBundleJson,
  type CmxBundle,
} from "@cmx-tools/contracts";
import { cmx } from "./cmx.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-"));
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

const defaultExports: CmxConfig["exports"] = {
  default: {
    required: true,
    type: {
      from: "@cmx-tools/contracts",
      import: "CmxNode",
    },
  },
};

async function writeStubPackage(
  rootDir: string,
  packageName: string,
  version: string,
): Promise<void> {
  const segments = packageName.startsWith("@")
    ? ["node_modules", ...packageName.split("/")]
    : ["node_modules", packageName];
  const pkgDir = path.join(rootDir, ...segments);
  await mkdir(pkgDir, { recursive: true });
  await writeFile(
    path.join(pkgDir, "package.json"),
    `${JSON.stringify(
      {
        name: packageName,
        version,
        main: "index.js",
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(pkgDir, "index.js"),
    "export const Hero = () => null;\nexport default Hero;\n",
    "utf8",
  );
}

async function writeStubPackageWithSubpath(
  rootDir: string,
  packageName: string,
  subpath: string,
  version: string,
): Promise<void> {
  const segments = packageName.startsWith("@")
    ? ["node_modules", ...packageName.split("/")]
    : ["node_modules", packageName];
  const pkgDir = path.join(rootDir, ...segments);
  await mkdir(pkgDir, { recursive: true });
  await writeFile(
    path.join(pkgDir, "package.json"),
    `${JSON.stringify(
      {
        name: packageName,
        version,
        exports: {
          [`./${subpath}`]: `./${subpath}.js`,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(pkgDir, `${subpath}.js`),
    "export const Widget = () => null;\nexport default Widget;\n",
    "utf8",
  );
}

async function writeAliasedStubPackageWithSubpath(
  rootDir: string,
  aliasName: string,
  packageName: string,
  subpath: string,
  version: string,
): Promise<void> {
  const aliasSegments = aliasName.startsWith("@")
    ? ["node_modules", ...aliasName.split("/")]
    : ["node_modules", aliasName];
  const pkgDir = path.join(rootDir, ...aliasSegments);
  await mkdir(pkgDir, { recursive: true });
  await writeFile(
    path.join(pkgDir, "package.json"),
    `${JSON.stringify(
      {
        name: packageName,
        version,
        exports: {
          [`./${subpath}`]: `./${subpath}.js`,
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(pkgDir, `${subpath}.js`),
    "export const Widget = () => null;\nexport default Widget;\n",
    "utf8",
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
        plugins: [cmx({ exports: defaultExports })],
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
        ).resolves.toContain('from "@cmx-tools/runtime/jsx-runtime"');
        await expect(
          readFile(path.join(outDir, "cmx-bundle.json"), "utf8").then(
            (source) => JSON.parse(source) as unknown,
          ),
        ).resolves.toEqual({
          version: 1,
          runtime: {
            importSource: "@cmx-tools/runtime",
          },
          exports: defaultExports,
          unsupportedValues: "error",
          unverifiedOptionalExports: "error",
          dependencies: [],
          entries: [
            {
              name: "entry",
              file: "entry.js",
              sourcemap: "entry.js.map",
              sourceExports: {
                default: {},
              },
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
        plugins: [cmx({ exports: defaultExports })],
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

  it("requires at least one configured export", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        "export default <main>Hello</main>;\n",
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx({ exports: {} })],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: false }),
        ).rejects.toMatchObject({
          errors: [
            expect.objectContaining({
              pluginCode: "cmx-exports-required",
            }),
          ],
        });
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
        plugins: [cmx({ exports: defaultExports })],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "[name].js",
          chunkFileNames: "[name]-[hash].js",
        });

        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.runtime).toEqual({
          importSource: "@cmx-tools/runtime",
        });
        expect(cmxBundle.dependencies).toEqual([]);
        expect(cmxBundle.entries).toHaveLength(2);
        expect(cmxBundle.entries).toEqual(
          expect.arrayContaining([
            {
              name: "home",
              file: "home.js",
              sourcemap: "home.js.map",
              sourceExports: {
                default: {},
              },
            },
            {
              name: "about",
              file: "about.js",
              sourcemap: "about.js.map",
              sourceExports: {
                default: {},
              },
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
        plugins: [cmx({ exports: defaultExports })],
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
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-external-fixture",
            private: true,
            dependencies: { "@theme/ui": "^0.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "1.0.0");
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
        plugins: [
          cmx({
            exports: defaultExports,
            externals: [{ contract: "@theme/ui", implementation: "@theme/ui" }],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });

        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.dependencies).toEqual([
          {
            name: "@theme/ui",
            specifier: "^0.0.0",
            version: "1.0.0",
          },
        ]);
        expect(cmxBundle.entries).toEqual([
          {
            name: "entry",
            file: "entry.js",
            sourcemap: "entry.js.map",
            sourceExports: {
              default: {},
            },
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

  it("includes dependency integrity when getIntegrity returns a string", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-external-fixture",
            private: true,
            dependencies: { "@theme/ui": "^0.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "2.0.0");
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        ['import Hero from "@theme/ui";', "export default <Hero />;"].join(
          "\n",
        ),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui"],
            cwd: tempDir,
            getIntegrity: () => "sha512-test",
          }),
        ],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });
        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.dependencies).toEqual([
          {
            name: "@theme/ui",
            specifier: "^0.0.0",
            version: "2.0.0",
            integrity: "sha512-test",
          },
        ]);
      } finally {
        await bundle.close();
      }
    });
  });

  it("rejects wildcard external package contracts", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-external-wildcard-fixture",
            private: true,
            dependencies: { "@theme/ui": "^1.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "1.0.0");
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        ['import Hero from "@theme/ui";', "export default <Hero />;"].join(
          "\n",
        ),
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui/*"],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).rejects.toMatchObject({
          errors: [
            {
              pluginCode: "cmx-external-contract-invalid",
            },
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });

  it("rejects scoped external contracts without a package name", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-external-scope-fixture",
            private: true,
            dependencies: { "@theme/ui": "^1.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "1.0.0");
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        ['import { Hero } from "@theme/ui";', "export default <Hero />;"].join(
          "\n",
        ),
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({ exports: defaultExports, externals: ["@theme"], cwd: tempDir }),
        ],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).rejects.toMatchObject({
          errors: [
            {
              pluginCode: "cmx-external-contract-invalid",
            },
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });

  it("rejects object external package contracts without an implementation", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-external-object-fixture",
            private: true,
            dependencies: { "@theme/ui": "^1.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        ['import Hero from "@theme/ui";', "export default <Hero />;"].join(
          "\n",
        ),
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({
            exports: defaultExports,
            externals: [
              { contract: "@theme/ui" },
            ] as unknown as CmxConfig["externals"],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).rejects.toMatchObject({
          errors: [
            {
              pluginCode: "cmx-external-contract-invalid",
            },
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });

  it.each([
    ["pattern keys", { "./*": "@theme/ui/*" }],
    ["condition keys", { import: "@theme/ui" }],
    ["array values", { ".": ["@theme/ui"] }],
    ["nested values", { ".": { import: "@theme/ui" } }],
  ])(
    "rejects implementation export maps with %s",
    async (_name, implementation) => {
      await withTempDir(async (tempDir) => {
        await writeFixture(
          tempDir,
          "package.json",
          `${JSON.stringify(
            {
              name: "cmx-external-map-fixture",
              private: true,
              dependencies: { "@theme/ui": "^1.0.0" },
            },
            null,
            2,
          )}\n`,
        );
        const entryFile = await writeFixture(
          tempDir,
          "entry.tsx",
          ['import Hero from "@theme/ui";', "export default <Hero />;"].join(
            "\n",
          ),
        );
        const bundle = await rolldown({
          input: entryFile,
          plugins: [
            cmx({
              exports: defaultExports,
              externals: [
                { contract: "@theme/ui", implementation },
              ] as unknown as CmxConfig["externals"],
              cwd: tempDir,
            }),
          ],
        });

        try {
          await expect(
            bundle.generate({ format: "esm", sourcemap: true }),
          ).rejects.toMatchObject({
            errors: [
              {
                pluginCode: "cmx-external-contract-invalid",
              },
            ],
          });
        } finally {
          await bundle.close();
        }
      });
    },
  );

  it("does not treat meta as a special bundle entry field", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          "export const meta = { title: 'Local' };",
          "export default <main>Local</main>;",
        ].join("\n"),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [cmx({ exports: defaultExports })],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });

        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.entries[0]).toMatchObject({
          name: "entry",
        });
        expect(cmxBundle.entries[0]).not.toHaveProperty("meta");
      } finally {
        await bundle.close();
      }
    });
  });

  it("allows local bindings that shadow configured external imports", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "shadow-fixture",
            private: true,
            dependencies: { "@theme/ui": "^0.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "1.0.0");
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
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui"],
            cwd: tempDir,
          }),
        ],
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
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "type-only-fixture",
            private: true,
            dependencies: { "@theme/ui": "^0.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "1.0.0");
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
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui"],
            cwd: tempDir,
          }),
        ],
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
        plugins: [cmx({ exports: defaultExports, externals: ["@theme/ui"] })],
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

  it("preserves public subpath in emitted external ref and package-level dependency name", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "subpath-fixture",
            private: true,
            dependencies: { "@acme/widgets": "^3.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackageWithSubpath(
        tempDir,
        "@acme/widgets",
        "button",
        "3.1.0",
      );
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import Widget from "@acme/widgets/button";',
          "export default <Widget />;",
        ].join("\n"),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@acme/widgets"],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });
        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.dependencies).toEqual([
          {
            name: "@acme/widgets",
            specifier: "^3.0.0",
            version: "3.1.0",
          },
        ]);
        await expect(
          readFile(path.join(outDir, "entry.js"), "utf8"),
        ).resolves.toContain('from: "@acme/widgets/button"');
      } finally {
        await bundle.close();
      }
    });
  });

  it("matches external imports by resolved package identity", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "alias-fixture",
            private: true,
            dependencies: { "@theme/ui": "^2.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeAliasedStubPackageWithSubpath(
        tempDir,
        "@alias/ui",
        "@theme/ui",
        "button",
        "2.1.0",
      );
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import Button from "@alias/ui/button";',
          "export default <Button />;",
        ].join("\n"),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui"],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });
        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.dependencies).toEqual([
          {
            name: "@theme/ui",
            specifier: "^2.0.0",
            version: "2.1.0",
          },
        ]);
        const entrySource = await readFile(
          path.join(outDir, "entry.js"),
          "utf8",
        );
        expect(entrySource).toContain('from: "@theme/ui/button"');
        expect(entrySource).not.toContain("@alias/ui");
      } finally {
        await bundle.close();
      }
    });
  });

  it("dedupes bundle.dependencies when the same external package is imported twice", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "dedupe-fixture",
            private: true,
            dependencies: { "@theme/ui": "^1.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "1.0.0");
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import DefaultHero, { Hero as Named } from "@theme/ui";',
          "export default <><DefaultHero /><Named /></>;",
        ].join("\n"),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui"],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });
        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.dependencies).toHaveLength(1);
        expect(cmxBundle.dependencies[0]?.name).toBe("@theme/ui");
      } finally {
        await bundle.close();
      }
    });
  });

  it("does not add bundle.dependencies for non-external local imports", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "local-mix-fixture",
            private: true,
            dependencies: { "@theme/ui": "^1.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "1.0.0");
      await writeFixture(
        tempDir,
        "local.tsx",
        "export const label = 'local';\n",
      );
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        [
          'import { label } from "./local";',
          'import Hero from "@theme/ui";',
          "export default <main>{label}<Hero /></main>;",
        ].join("\n"),
      );
      const outDir = path.join(tempDir, "dist");
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui"],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await bundle.write({
          dir: outDir,
          entryFileNames: "entry.js",
        });
        const cmxBundle = await readBundle(outDir);
        expect(cmxBundle.dependencies).toEqual([
          {
            name: "@theme/ui",
            specifier: "^1.0.0",
            version: "1.0.0",
          },
        ]);
        await expect(
          readFile(path.join(outDir, "entry.js"), "utf8"),
        ).resolves.toContain("local");
      } finally {
        await bundle.close();
      }
    });
  });

  it("rejects when the resolved package is not declared in the consumer package.json", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "missing-decl-fixture",
            private: true,
            dependencies: { other: "^1.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "1.0.0");
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        ['import Hero from "@theme/ui";', "export default <Hero />;"].join(
          "\n",
        ),
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui"],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).rejects.toMatchObject({
          errors: [
            {
              pluginCode: "cmx-external-missing-consumer-dependency",
            },
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });

  it("rejects when an external import cannot be resolved", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "unresolved-fixture",
            private: true,
            dependencies: { "@theme/ui": "^1.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        ['import Hero from "@theme/ui";', "export default <Hero />;"].join(
          "\n",
        ),
      );
      const bundle = await rolldown({
        input: entryFile,
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui"],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).rejects.toMatchObject({
          errors: [
            {
              pluginCode: "cmx-external-resolve-failed",
            },
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });

  it("rejects when the same module is both a Rolldown external and a CMX external", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "rolldown-external-fixture",
            private: true,
            dependencies: { "@theme/ui": "^1.0.0" },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@theme/ui", "1.0.0");
      const entryFile = await writeFixture(
        tempDir,
        "entry.tsx",
        ['import Hero from "@theme/ui";', "export default <Hero />;"].join(
          "\n",
        ),
      );
      const bundle = await rolldown({
        input: entryFile,
        external: ["@theme/ui"],
        plugins: [
          cmx({
            exports: defaultExports,
            externals: ["@theme/ui"],
            cwd: tempDir,
          }),
        ],
      });

      try {
        await expect(
          bundle.generate({ format: "esm", sourcemap: true }),
        ).rejects.toMatchObject({
          errors: [
            {
              pluginCode: "cmx-bundle-external-conflict",
            },
          ],
        });
      } finally {
        await bundle.close();
      }
    });
  });
});
