import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { PluginContext } from "rolldown";
import { describe, expect, it } from "vitest";
import { discoverImplementationPackageExports } from "./discoverImplementationPackageExports.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-exports-"));
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

function contextResolvingPackageJson(
  packageJsonPath: string | undefined,
): PluginContext {
  return {
    resolve: () =>
      Promise.resolve(
        packageJsonPath ? { id: packageJsonPath, packageJsonPath } : null,
      ),
  } as unknown as PluginContext;
}

describe("discoverImplementationPackageExports", () => {
  it("discovers simple exact exports", async () => {
    await withTempDir(async (tempDir) => {
      const packageJsonPath = await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            exports: {
              ".": "./index.js",
              "./tokens": "./tokens.js",
            },
          },
          null,
          2,
        )}\n`,
      );

      await expect(
        discoverImplementationPackageExports(
          contextResolvingPackageJson(packageJsonPath),
          {
            implementation: "@runtime/ui",
            importerId: path.join(tempDir, "entry.ts"),
          },
        ),
      ).resolves.toEqual({ kind: "simple", subpaths: [".", "./tokens"] });
    });
  });

  it("falls back to root-only when exports are unavailable", async () => {
    await withTempDir(async (tempDir) => {
      const packageJsonPath = await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify({ name: "@runtime/ui" }, null, 2)}\n`,
      );

      await expect(
        discoverImplementationPackageExports(
          contextResolvingPackageJson(packageJsonPath),
          {
            implementation: "@runtime/ui",
            importerId: path.join(tempDir, "entry.ts"),
          },
        ),
      ).resolves.toEqual({ kind: "rootOnly" });

      await expect(
        discoverImplementationPackageExports(
          contextResolvingPackageJson(undefined),
          {
            implementation: "@runtime/ui",
            importerId: path.join(tempDir, "entry.ts"),
          },
        ),
      ).resolves.toEqual({ kind: "rootOnly" });
    });
  });

  it("discovers exports from local implementation folders", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "runtime-ui/package.json",
        `${JSON.stringify(
          {
            exports: {
              ".": "./index.js",
              "./tokens": "./tokens.js",
            },
          },
          null,
          2,
        )}\n`,
      );

      await expect(
        discoverImplementationPackageExports(
          contextResolvingPackageJson(undefined),
          {
            implementation: "./runtime-ui",
            importerId: path.join(tempDir, "entry.ts"),
          },
        ),
      ).resolves.toEqual({ kind: "simple", subpaths: [".", "./tokens"] });
    });
  });

  it("does not discover exports from local implementation files", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            exports: {
              ".": "./index.js",
              "./tokens": "./tokens.js",
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeFixture(
        tempDir,
        "runtime-ui.ts",
        "export const Hero = () => null;\n",
      );

      await expect(
        discoverImplementationPackageExports(
          contextResolvingPackageJson(undefined),
          {
            implementation: "./runtime-ui.ts",
            importerId: path.join(tempDir, "entry.ts"),
          },
        ),
      ).resolves.toEqual({ kind: "rootOnly" });
    });
  });

  it("reports complex exports", async () => {
    await withTempDir(async (tempDir) => {
      const packageJsonPath = await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            exports: {
              ".": {
                import: "./index.js",
              },
            },
          },
          null,
          2,
        )}\n`,
      );

      await expect(
        discoverImplementationPackageExports(
          contextResolvingPackageJson(packageJsonPath),
          {
            implementation: "@runtime/ui",
            importerId: path.join(tempDir, "entry.ts"),
          },
        ),
      ).resolves.toEqual({ kind: "complex" });
    });
  });
});
