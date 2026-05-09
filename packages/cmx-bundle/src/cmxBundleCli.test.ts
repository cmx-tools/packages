import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CMX_BUNDLE_FILE_NAME, parseCmxBundleJson } from "cmx-contracts";
import { runCmxBundleCli } from "./cmxBundleCli.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-bundle-cli-"));
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

async function writePackageJson(rootDir: string): Promise<void> {
  await writeFixture(
    rootDir,
    "package.json",
    JSON.stringify({ name: "cmx-bundle-cli-test", private: true }, null, 2),
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
    const exitCode = await runCmxBundleCli(args);
    return { exitCode, stdout, stderr };
  } finally {
    process.chdir(previousCwd);
    process.env = previousEnv;
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

describe("cmx-bundle cli", () => {
  it("compiles files with explicit compile verb", async () => {
    await withTempDir(async (tempDir) => {
      await writePackageJson(tempDir);
      await writeFixture(
        tempDir,
        "content/pages/about.tsx",
        "export default <main>About</main>;\n",
      );
      await writeFixture(
        tempDir,
        "content/pages/legal/terms.tsx",
        "export default <main>Terms</main>;\n",
      );
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

      const result = await runCli(tempDir, [
        "compile",
        "content/**/*.tsx",
        "dist",
      ]);

      expect(result.exitCode).toBe(0);
      const bundle = parseCmxBundleJson(
        await readFile(
          path.join(tempDir, "dist", CMX_BUNDLE_FILE_NAME),
          "utf8",
        ),
      );
      expect(bundle.entries.map((entry) => entry.name).sort()).toEqual([
        "about",
        "legal/terms",
      ]);
    });
  }, 15000);

  it("supports omitted compile verb", async () => {
    await withTempDir(async (tempDir) => {
      await writePackageJson(tempDir);
      await writeFixture(
        tempDir,
        "pages/index.tsx",
        "export default <main />;\n",
      );
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { exports: { default: { required: true, type: { from: 'cmx-contracts', import: 'CmxNode' } } } };\n",
      );

      const result = await runCli(tempDir, ["pages/*.tsx", "dist"]);

      expect(result.exitCode).toBe(0);
      await expect(
        readFile(path.join(tempDir, "dist", CMX_BUNDLE_FILE_NAME), "utf8"),
      ).resolves.toContain('"name": "index"');
    });
  }, 15000);

  it("fails invalid verb", async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(tempDir, ["invalid", "*.tsx", "dist"]);
      expect(result.exitCode).toBe(1);
    });
  }, 15000);

  it("supports --help and --version", async () => {
    const help = await runCli(process.cwd(), ["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("cmx-bundle compile <glob> <outDir>");

    const version = await runCli(process.cwd(), ["--version"]);
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toBe("0.1.0");
  }, 15000);

  it("fails on zero matches", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { exports: { default: { required: true, type: { from: 'cmx-contracts', import: 'CmxNode' } } } };\n",
      );
      const result = await runCli(tempDir, [
        "compile",
        "missing/**/*.tsx",
        "dist",
      ]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("No files matched glob");
    });
  }, 15000);

  it("fails on duplicate derived entry names", async () => {
    await withTempDir(async (tempDir) => {
      await writeFixture(
        tempDir,
        "pages/about.tsx",
        "export default <main />;\n",
      );
      await writeFixture(
        tempDir,
        "pages/about.jsx",
        "export default <main />;\n",
      );
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { exports: { default: { required: true, type: { from: 'cmx-contracts', import: 'CmxNode' } } } };\n",
      );
      const result = await runCli(tempDir, ["compile", "pages/*.*x", "dist"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Duplicate bundle entry name derived");
    });
  }, 15000);

  it("does not clean output directory", async () => {
    await withTempDir(async (tempDir) => {
      await writePackageJson(tempDir);
      await writeFixture(
        tempDir,
        "pages/index.tsx",
        "export default <main />;\n",
      );
      await writeFixture(
        tempDir,
        "cmx.config.ts",
        "export default { exports: { default: { required: true, type: { from: 'cmx-contracts', import: 'CmxNode' } } } };\n",
      );
      await writeFixture(tempDir, "dist/stale.txt", "keep\n");

      const result = await runCli(tempDir, ["compile", "pages/*.tsx", "dist"]);

      expect(result.exitCode).toBe(0);
      await expect(
        readFile(path.join(tempDir, "dist", "stale.txt"), "utf8"),
      ).resolves.toBe("keep\n");
    });
  }, 15000);
});
