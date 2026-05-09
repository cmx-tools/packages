import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCmxCliConfig } from "./resolveCmxCliConfig.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-cli-config-"));
  await run(tempDir);
}

async function writeFixture(
  rootDir: string,
  relativePath: string,
  source: string,
): Promise<void> {
  const absolutePath = path.join(rootDir, relativePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, source, "utf8");
}

describe("resolveCmxCliConfig", () => {
  it("loads config from cmx.config.ts", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        [
          "export default {",
          "  exports: {",
          "    default: {",
          "      required: true,",
          "      type: { from: 'cmx-contracts', import: 'CmxNode' }",
          "    }",
          "  }",
          "};",
        ].join("\n"),
      );

      const config = await resolveCmxCliConfig({ cwd: tempDir });

      expect(config.exports).toEqual({
        default: {
          required: true,
          type: {
            from: "cmx-contracts",
            import: "CmxNode",
          },
        },
      });
    });
  });

  it("returns empty config when no config source exists", async () => {
    await withTempDir(async (tempDir) => {
      const config = await resolveCmxCliConfig({ cwd: tempDir });
      expect(config).toEqual({});
    });
  });

  it("fails when explicit --config file is missing", async () => {
    await withTempDir(async (tempDir) => {
      await expect(
        resolveCmxCliConfig({
          cwd: tempDir,
          argv: ["--config", "missing.config.ts"],
        }),
      ).rejects.toThrow("Failed to resolve CMX config");
    });
  });

  it("merges repeated --external entries into config", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        [
          "export default {",
          "  externals: [",
          "    '@pkg/from-config',",
          "    { contract: '@pkg/override', implementation: './from-config.js' }",
          "  ]",
          "};",
        ].join("\n"),
      );

      const config = await resolveCmxCliConfig({
        cwd: tempDir,
        argv: [
          "--external",
          "@pkg/new",
          "--external",
          "@pkg/override=./from-cli.js",
        ],
      });

      expect(config.externals).toEqual([
        "@pkg/from-config",
        {
          contract: "@pkg/override",
          implementation: "./from-cli.js",
        },
        "@pkg/new",
      ]);
    });
  });

  it("ignores unknown flags", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { externals: ['@pkg/config'] };\n",
      );

      const config = await resolveCmxCliConfig({
        cwd: tempDir,
        argv: ["--unknown-flag", "value", "--external", "@pkg/cli"],
      });

      expect(config.externals).toEqual(["@pkg/config", "@pkg/cli"]);
    });
  });
});
