import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { generateCmxEnvironment } from "./index.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-environment-"));
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

describe("generateCmxEnvironment", () => {
  it("generates environment source and dependencies for configured externals", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-environment-fixture",
            private: true,
            dependencies: {
              "@example/backend-contract": "^2.0.0",
              "@example/ui-library": "workspace:*",
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@example/backend-contract", "2.3.0");
      await writeStubPackage(tempDir, "@example/ui-library", "1.1.0");
      await writeFixture(
        tempDir,
        "api.ts",
        "export const Hero = () => null;\nexport default Hero;\n",
      );

      const result = await generateCmxEnvironment({
        cwd: tempDir,
        exports: {
          default: {
            required: true,
            type: {
              from: "@cmx-tools/contracts",
              import: "CmxNode",
            },
          },
        },
        externals: [
          {
            contract: "@example/backend-contract",
            implementation: "./api.ts",
          },
          "@example/ui-library",
        ],
        getIntegrity: ({ packageName }) =>
          packageName === "@example/backend-contract" ? "sha512-backend" : null,
      });

      expect(result.dependencies).toEqual([
        {
          name: "@example/backend-contract",
          specifier: "^2.0.0",
          version: "2.3.0",
          integrity: "sha512-backend",
        },
        {
          name: "@example/ui-library",
          specifier: "workspace:*",
          version: "1.1.0",
        },
      ]);
      expect(result.source).toContain(
        '"@example/backend-contract": Api satisfies typeof ExampleBackendContract',
      );
      expect(result.source).toContain(
        '"@example/ui-library": ExampleUiLibrary',
      );
    });
  });

  it("rejects complex implementation exports", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-environment-complex-fixture",
            private: true,
            dependencies: {
              "@theme/ui": "^3.0.0",
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeFixture(
        tempDir,
        "node_modules/@theme/ui/package.json",
        `${JSON.stringify(
          {
            name: "@theme/ui",
            version: "3.1.0",
            exports: {
              "./*": "./*.js",
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeFixture(
        tempDir,
        "node_modules/@theme/ui/index.js",
        "export const Hero = () => null;\n",
      );

      await expect(
        generateCmxEnvironment({
          cwd: tempDir,
          exports: {
            default: {
              required: true,
              type: {
                from: "@cmx-tools/contracts",
                import: "CmxNode",
              },
            },
          },
          externals: ["@theme/ui"],
        }),
      ).rejects.toThrow("cmx-external-implementation-exports-complex");
    });
  });

  it("rejects empty external contract", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-environment-empty-contract",
            private: true,
            dependencies: {},
          },
          null,
          2,
        )}\n`,
      );
      await writeFixture(tempDir, "api.ts", "export default {};\n");

      await expect(
        generateCmxEnvironment({
          cwd: tempDir,
          exports: {
            default: {
              required: true,
              type: {
                from: "@cmx-tools/contracts",
                import: "CmxNode",
              },
            },
          },
          externals: [{ contract: "  ", implementation: "./api.ts" }],
        }),
      ).rejects.toThrow("CMX environment external contract must not be empty");
    });
  });
});
