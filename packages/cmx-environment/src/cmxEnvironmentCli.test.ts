import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { runCmxEnvironmentCli } from "./cmxEnvironmentCli.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-environment-cli-"));
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
    `${JSON.stringify({ name: packageName, version, main: "index.js" }, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(pkgDir, "index.js"),
    "export default {};\n",
    "utf8",
  );
}

async function runCli(cwd: string, args: readonly string[]) {
  const previousCwd = process.cwd();
  const previousEnv = process.env;
  let stdout = "";
  let stderr = "";
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);

  process.chdir(cwd);
  process.env = {
    ...previousEnv,
    CMX_CWD: cwd,
  };
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const exitCode = await runCmxEnvironmentCli(args);
    return { exitCode, stdout, stderr };
  } finally {
    process.chdir(previousCwd);
    process.env = previousEnv;
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

describe("cmx-environment cli", () => {
  it("generates environment file with explicit generate verb", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-environment-cli-test",
            private: true,
            dependencies: {
              "@site/contract": "^1.0.0",
              "@site/theme": "^2.0.0",
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@site/contract", "1.2.3");
      await writeStubPackage(tempDir, "@site/theme", "2.4.0");
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        [
          "export default {",
          "  exports: {",
          "    default: { required: true, type: { from: 'cmx-contracts', import: 'CmxNode' } }",
          "  },",
          "  externals: [",
          "    { contract: '@site/contract', implementation: './contract-api.ts' },",
          "    '@site/theme'",
          "  ]",
          "};",
        ].join("\n"),
      );

      const result = await runCli(tempDir, [
        "generate",
        "dist/cmx-environment.ts",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toBe("");

      const generated = await readFile(
        path.join(tempDir, "dist", "cmx-environment.ts"),
        "utf8",
      );
      expect(generated).toContain('"@site/contract"');
      expect(generated).toContain('"@site/theme"');
    });
  });

  it("supports omitted generate verb", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-environment-cli-test",
            private: true,
            dependencies: {
              "@site/contract": "^1.0.0",
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@site/contract", "1.2.3");
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { exports: { default: { required: true, type: { from: 'cmx-contracts', import: 'CmxNode' } } }, externals: ['@site/contract'] };\n",
      );

      const result = await runCli(tempDir, ["dist/cmx-environment.ts"]);

      expect(result.exitCode).toBe(0);
      await expect(
        readFile(path.join(tempDir, "dist", "cmx-environment.ts"), "utf8"),
      ).resolves.toContain("export const environment");
    });
  });

  it("fails invalid verb", async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(tempDir, [
        "invalid",
        "dist/cmx-environment.ts",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        "Usage: cmx-environment generate <outFile>",
      );
    });
  });

  it("supports --help and --version", async () => {
    const help = await runCli(process.cwd(), ["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("cmx-environment generate <outFile>");

    const version = await runCli(process.cwd(), ["--version"]);
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toBe("0.1.0");
  });

  it("creates parent directory and overwrites existing file", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-environment-cli-test",
            private: true,
            dependencies: {
              "@site/contract": "^1.0.0",
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@site/contract", "1.2.3");
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { exports: { default: { required: true, type: { from: 'cmx-contracts', import: 'CmxNode' } } }, externals: ['@site/contract'] };\n",
      );
      await writeFixture(tempDir, "dist/cmx-environment.ts", "stale\n");

      const result = await runCli(tempDir, [
        "generate",
        "dist/cmx-environment.ts",
      ]);

      expect(result.exitCode).toBe(0);
      const generated = await readFile(
        path.join(tempDir, "dist", "cmx-environment.ts"),
        "utf8",
      );
      expect(generated).not.toBe("stale\n");
      expect(generated).toContain("export const environment");
    });
  });

  it("applies --external override over config mapping", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-environment-cli-test",
            private: true,
            dependencies: {
              "@site/contract": "^1.0.0",
            },
          },
          null,
          2,
        )}\n`,
      );
      await writeStubPackage(tempDir, "@site/contract", "1.2.3");
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        [
          "export default {",
          "  exports: {",
          "    default: { required: true, type: { from: 'cmx-contracts', import: 'CmxNode' } }",
          "  },",
          "  externals: [",
          "    { contract: '@site/contract', implementation: './old-impl.ts' }",
          "  ]",
          "};",
        ].join("\n"),
      );

      const result = await runCli(tempDir, [
        "generate",
        "dist/cmx-environment.ts",
        "--external",
        "@site/contract=./new-impl.ts",
      ]);

      expect(result.exitCode).toBe(0);
      const generated = await readFile(
        path.join(tempDir, "dist", "cmx-environment.ts"),
        "utf8",
      );
      expect(generated).toContain('from "./new-impl.ts"');
      expect(generated).not.toContain('from "./old-impl.ts"');
    });
  });

  it("writes diagnostics to stderr and exits 1 on failure", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "package.json",
        `${JSON.stringify(
          {
            name: "cmx-environment-cli-test",
            private: true,
            dependencies: {},
          },
          null,
          2,
        )}\n`,
      );
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { exports: { default: { required: true, type: { from: 'cmx-contracts', import: 'CmxNode' } } }, externals: ['@site/missing'] };\n",
      );

      const result = await runCli(tempDir, [
        "generate",
        "dist/cmx-environment.ts",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("CMX could not resolve external import");
    });
  });

  it("prints install hint when cmx-cli is missing", async () => {
    let stderr = "";
    const stderrWrite = process.stderr.write.bind(process.stderr);
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderr += String(chunk);
      return true;
    }) as typeof process.stderr.write;
    try {
      const exitCode = await runCmxEnvironmentCli(["generate", "dist/env.ts"], {
        importModule: async () => {
          const error = new Error("missing") as Error & { code: string };
          error.code = "ERR_MODULE_NOT_FOUND";
          throw error;
        },
      });
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Missing CLI dependency "cmx-cli"');
    } finally {
      process.stderr.write = stderrWrite;
    }
  });
});
