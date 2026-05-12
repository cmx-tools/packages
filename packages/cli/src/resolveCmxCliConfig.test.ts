import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCmxCliConfig } from "./index.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-cli-"));
  try {
    await run(tempDir);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
          "      type: { from: '@cmx-tools/contracts', import: 'CmxNode' }",
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
            from: "@cmx-tools/contracts",
            import: "CmxNode",
          },
        },
      });
    });
  });

  it("returns empty config when no config source exists", async () => {
    await withTempDir(async (tempDir) => {
      const config = await resolveCmxCliConfig({ cwd: tempDir });
      expect(config).toEqual({ cwd: tempDir });
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

  it("loads config from .cmxrc", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(tempDir, ".cmxrc", "externals[]=@pkg/rc\n");
      const config = await resolveCmxCliConfig({ cwd: tempDir });
      expect(config.externals).toEqual(["@pkg/rc"]);
    });
  });

  it("loads config from package.json#cmx", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        '{"name":"fixture","cmx":{"externals":["@pkg/package-json"]}}',
      );
      const config = await resolveCmxCliConfig({ cwd: tempDir });
      expect(config.externals).toEqual(["@pkg/package-json"]);
    });
  });

  it("uses --config over CMX_CONFIG and bypasses discovery", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { externals: ['@pkg/discovery'] };\n",
      );
      await writeFixture(
        tempDir,
        "first.config.ts",
        "export default { externals: ['@pkg/first'] };\n",
      );
      await writeFixture(
        tempDir,
        "second.config.ts",
        "export default { externals: ['@pkg/second'] };\n",
      );

      const config = await resolveCmxCliConfig({
        cwd: tempDir,
        env: { CMX_CONFIG: "first.config.ts" },
        argv: ["--config", "second.config.ts"],
      });

      expect(config.externals).toEqual(["@pkg/second"]);
    });
  });

  it("uses --cwd over CMX_CWD and applies cwd to config discovery", async () => {
    await withTempDir(async (tempDir) => {
      const fromArgv = path.join(tempDir, "from-argv");
      const fromEnv = path.join(tempDir, "from-env");
      await writeFixture(
        fromArgv,
        "cmx.config.ts",
        "export default { externals: ['@pkg/from-argv'] };\n",
      );
      await writeFixture(
        fromEnv,
        "cmx.config.ts",
        "export default { externals: ['@pkg/from-env'] };\n",
      );

      const config = await resolveCmxCliConfig({
        cwd: tempDir,
        env: { CMX_CWD: fromEnv },
        argv: ["--cwd", fromArgv],
      });

      expect(config.cwd).toBe(fromArgv);
      expect(config.externals).toEqual(["@pkg/from-argv"]);
    });
  });

  it("loads .env and .env.NODE_ENV during config evaluation", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(tempDir, ".env", "CMX_BASE=from-env\n");
      await writeFixture(tempDir, ".env.test", "CMX_OVERRIDE=from-env-test\n");
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        [
          "export default {",
          "  externals: [",
          "    process.env.CMX_BASE,",
          "    process.env.CMX_OVERRIDE",
          "  ]",
          "};",
        ].join("\n"),
      );

      const config = await resolveCmxCliConfig({
        cwd: tempDir,
        env: { NODE_ENV: "test" },
      });
      expect(config.externals).toEqual(["from-env", "from-env-test"]);
    });
  });

  it("replaces exports and externals with JSON hatches", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        [
          "export default {",
          "  exports: { default: { required: false } },",
          "  externals: ['@pkg/config']",
          "};",
        ].join("\n"),
      );

      const config = await resolveCmxCliConfig({
        cwd: tempDir,
        argv: [
          "--exports",
          '{"default":{"required":true}}',
          "--externals",
          '["@pkg/override"]',
        ],
      });

      expect(config.exports).toEqual({ default: { required: true } });
      expect(config.externals).toEqual(["@pkg/override"]);
    });
  });

  it("applies dotted overrides with scalar coercion", async () => {
    await withTempDir(async (tempDir) => {
      const config = await resolveCmxCliConfig({
        cwd: tempDir,
        argv: [
          "--exports.default.required",
          "true",
          "--exports.default.type.import",
          "CmxNode",
          "--exports.default.note",
          "falsey",
          "--exports.default.maybe",
          "null",
        ],
      });

      expect(config.exports).toEqual({
        default: {
          required: true,
          type: { import: "CmxNode" },
          note: "falsey",
          maybe: null,
        },
      });
    });
  });

  it("parses --external object implementation map", async () => {
    await withTempDir(async (tempDir) => {
      const config = await resolveCmxCliConfig({
        cwd: tempDir,
        argv: [
          "--external",
          '@pkg/ui={".":"./ui.js","./button":"./button.js"}',
        ],
      });

      expect(config.externals).toEqual([
        {
          contract: "@pkg/ui",
          implementation: {
            ".": "./ui.js",
            "./button": "./button.js",
          },
        },
      ]);
    });
  });

  it("preserves unknown config keys", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { customSection: { enabled: true } };\n",
      );

      const config = await resolveCmxCliConfig({ cwd: tempDir });
      expect((config as Record<string, unknown>).customSection).toEqual({
        enabled: true,
      });
    });
  });

  it("fails on malformed JSON hatches", async () => {
    await withTempDir(async (tempDir) => {
      await expect(
        resolveCmxCliConfig({
          cwd: tempDir,
          argv: ["--exports", "{"],
        }),
      ).rejects.toThrow("CMX CLI config syntax error");
    });
  });

  it("fails on malformed --external JSON map", async () => {
    await withTempDir(async (tempDir) => {
      await expect(
        resolveCmxCliConfig({
          cwd: tempDir,
          argv: ["--external", "@pkg/ui={"],
        }),
      ).rejects.toThrow("CMX CLI config syntax error");
    });
  });

  it("fails when value flags receive another flag token", async () => {
    await withTempDir(async (tempDir) => {
      await expect(
        resolveCmxCliConfig({
          cwd: tempDir,
          argv: ["--config", "--external", "@pkg/ui"],
        }),
      ).rejects.toThrow(
        "CMX CLI config syntax error: --config requires a value",
      );
    });
  });

  it("isolates env across concurrent resolution calls", async () => {
    await withTempDir(async (tempDir) => {
      const firstDir = path.join(tempDir, "first");
      const secondDir = path.join(tempDir, "second");
      await writeFixture(
        firstDir,
        "cmx.config.ts",
        "export default { externals: [process.env.CMX_MARK] };\n",
      );
      await writeFixture(
        secondDir,
        "cmx.config.ts",
        "export default { externals: [process.env.CMX_MARK] };\n",
      );

      const [first, second] = await Promise.all([
        resolveCmxCliConfig({ cwd: firstDir, env: { CMX_MARK: "first" } }),
        resolveCmxCliConfig({ cwd: secondDir, env: { CMX_MARK: "second" } }),
      ]);

      expect(first.externals).toEqual(["first"]);
      expect(second.externals).toEqual(["second"]);
    });
  });
});
