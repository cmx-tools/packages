import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { CMX_BUNDLE_FILE_NAME, type CmxBundle } from "@cmx-tools/contracts";
import { runCmxDocumentCli } from "./cmxDocumentCli.js";

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-document-cli-"));
  await run(tempDir);
}

async function runCli(cwd: string, args: readonly string[]) {
  const previousCwd = process.cwd();
  let stdout = "";
  let stderr = "";
  const stdoutWrite = process.stdout.write.bind(process.stdout);
  const stderrWrite = process.stderr.write.bind(process.stderr);

  process.chdir(cwd);
  process.stdout.write = ((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  process.stderr.write = ((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  }) as typeof process.stderr.write;

  try {
    const exitCode = await runCmxDocumentCli(args);
    return { exitCode, stdout, stderr };
  } finally {
    process.chdir(previousCwd);
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

async function writeBundleFixture(input: {
  bundleDir: string;
  entries: Array<{ name: string; file: string; source: string }>;
}): Promise<void> {
  const runtimeFile = path.join(input.bundleDir, "runtime.js");

  await mkdir(input.bundleDir, { recursive: true });
  await writeFile(
    runtimeFile,
    [
      "export function isRuntimeNode(value) {",
      "  return value && value.kind === 'element';",
      "}",
    ].join("\n"),
    "utf8",
  );

  const bundle: CmxBundle = {
    version: 1,
    runtime: {
      importSource: pathToFileURL(runtimeFile).href,
    },
    dependencies: [],
    entries: input.entries.map((entry) => ({
      name: entry.name,
      file: entry.file,
      sourcemap: `${entry.file}.map`,
      sourceExports: {
        default: {
          type: {
            from: "@cmx-tools/contracts",
            import: "CmxNode",
          },
        },
      },
    })),
    chunks: [],
    exports: {
      default: {
        required: true,
        type: {
          from: "@cmx-tools/contracts",
          import: "CmxNode",
        },
      },
    },
    unsupportedValues: "error",
    unverifiedOptionalExports: "error",
  };

  await writeFile(
    path.join(input.bundleDir, CMX_BUNDLE_FILE_NAME),
    `${JSON.stringify(bundle, null, 2)}\n`,
    "utf8",
  );

  for (const entry of input.entries) {
    await writeFile(
      path.join(input.bundleDir, entry.file),
      entry.source,
      "utf8",
    );
    await writeFile(
      path.join(input.bundleDir, `${entry.file}.map`),
      JSON.stringify({ version: 3, sources: ["source.tsx"], mappings: "" }),
      "utf8",
    );
  }
}

describe("cmx-document cli", () => {
  it("renders with explicit render verb", async () => {
    await withTempDir(async (tempDir) => {
      await writeBundleFixture({
        bundleDir: path.join(tempDir, "bundle"),
        entries: [
          {
            name: "home",
            file: "home.js",
            source: 'export default { kind: "element", tag: "main" };\n',
          },
        ],
      });

      const result = await runCli(tempDir, ["render", "bundle"]);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({
        home: {
          $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
        },
      });
      expect(result.stderr).toBe("");
    });
  });

  it("supports omitted render verb", async () => {
    await withTempDir(async (tempDir) => {
      await writeBundleFixture({
        bundleDir: path.join(tempDir, "bundle"),
        entries: [
          {
            name: "index",
            file: "index.js",
            source: 'export default { kind: "element", tag: "main" };\n',
          },
        ],
      });

      const result = await runCli(tempDir, ["bundle"]);

      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toHaveProperty("index");
    });
  });

  it("fails invalid verb", async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(tempDir, ["invalid", "bundle"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Usage: cmx-document render <bundleDir>");
    });
  });

  it("fails unknown flags", async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(tempDir, ["render", "bundle", "--outdir"]);
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Unknown option: --outdir");
    });
  });

  it("supports --help and --version", async () => {
    const help = await runCli(process.cwd(), ["--help"]);
    expect(help.exitCode).toBe(0);
    expect(help.stdout).toContain("cmx-document render <bundleDir>");

    const version = await runCli(process.cwd(), ["--version"]);
    expect(version.exitCode).toBe(0);
    expect(version.stdout.trim()).toBe(readPackageVersion());
  });

  it("returns partial result with stdout documents and stderr diagnostics", async () => {
    await withTempDir(async (tempDir) => {
      await writeBundleFixture({
        bundleDir: path.join(tempDir, "bundle"),
        entries: [
          {
            name: "ok",
            file: "ok.js",
            source: 'export default { kind: "element", tag: "main" };\n',
          },
          {
            name: "broken",
            file: "broken.js",
            source: "throw new Error('broken render');\n",
          },
        ],
      });

      const result = await runCli(tempDir, ["render", "bundle"]);

      expect(result.exitCode).toBe(1);
      expect(JSON.parse(result.stdout)).toHaveProperty("ok");
      expect(JSON.parse(result.stdout)).not.toHaveProperty("broken");
      expect(result.stderr).toContain("broken render");
    });
  });

  it("returns error with diagnostics and no stdout documents", async () => {
    await withTempDir(async (tempDir) => {
      await writeBundleFixture({
        bundleDir: path.join(tempDir, "bundle"),
        entries: [
          {
            name: "broken",
            file: "broken.js",
            source: "throw new Error('all broken');\n",
          },
        ],
      });

      const result = await runCli(tempDir, ["render", "bundle"]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("all broken");
    });
  });

  it("writes rendered documents to --out-dir and emits no stdout", async () => {
    await withTempDir(async (tempDir) => {
      await writeBundleFixture({
        bundleDir: path.join(tempDir, "bundle"),
        entries: [
          {
            name: "home",
            file: "home.js",
            source: 'export default { kind: "element", tag: "main" };\n',
          },
        ],
      });

      const result = await runCli(tempDir, [
        "render",
        "bundle",
        "--out-dir",
        "documents",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(
        JSON.parse(
          await readFile(path.join(tempDir, "documents", "home.json"), "utf8"),
        ),
      ).toMatchObject({
        $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
      });
    });
  });

  it("writes successful documents on partial render and exits non-zero", async () => {
    await withTempDir(async (tempDir) => {
      await writeBundleFixture({
        bundleDir: path.join(tempDir, "bundle"),
        entries: [
          {
            name: "ok",
            file: "ok.js",
            source: 'export default { kind: "element", tag: "main" };\n',
          },
          {
            name: "broken",
            file: "broken.js",
            source: "throw new Error('broken render');\n",
          },
        ],
      });

      const result = await runCli(tempDir, [
        "render",
        "bundle",
        "--out-dir",
        "documents",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("broken render");
      expect(
        JSON.parse(
          await readFile(path.join(tempDir, "documents", "ok.json"), "utf8"),
        ),
      ).toHaveProperty("$schema");
    });
  });

  it("writes no documents when all entries fail in --out-dir mode", async () => {
    await withTempDir(async (tempDir) => {
      await writeBundleFixture({
        bundleDir: path.join(tempDir, "bundle"),
        entries: [
          {
            name: "broken",
            file: "broken.js",
            source: "throw new Error('all broken');\n",
          },
        ],
      });

      const result = await runCli(tempDir, [
        "render",
        "bundle",
        "--out-dir",
        "documents",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("all broken");
      await expect(
        readFile(path.join(tempDir, "documents", "broken.json"), "utf8"),
      ).rejects.toThrow();
    });
  });

  it("does not clean stale files in --out-dir mode", async () => {
    await withTempDir(async (tempDir) => {
      await writeBundleFixture({
        bundleDir: path.join(tempDir, "bundle"),
        entries: [
          {
            name: "home",
            file: "home.js",
            source: 'export default { kind: "element", tag: "main" };\n',
          },
        ],
      });
      await mkdir(path.join(tempDir, "documents"), { recursive: true });
      await writeFile(
        path.join(tempDir, "documents", "stale.json"),
        '{"stale":true}\n',
        "utf8",
      );

      const result = await runCli(tempDir, [
        "render",
        "bundle",
        "--out-dir",
        "documents",
      ]);

      expect(result.exitCode).toBe(0);
      expect(
        await readFile(path.join(tempDir, "documents", "stale.json"), "utf8"),
      ).toBe('{"stale":true}\n');
      expect(
        JSON.parse(
          await readFile(path.join(tempDir, "documents", "home.json"), "utf8"),
        ),
      ).toHaveProperty("$schema");
    });
  });

  it("fails --out-dir writes when bundle entry name escapes output directory", async () => {
    await withTempDir(async (tempDir) => {
      await writeBundleFixture({
        bundleDir: path.join(tempDir, "bundle"),
        entries: [
          {
            name: "../escape",
            file: "home.js",
            source: 'export default { kind: "element", tag: "main" };\n',
          },
        ],
      });

      const result = await runCli(tempDir, [
        "render",
        "bundle",
        "--out-dir",
        "documents",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        'Invalid bundle entry name for --out-dir output: "../escape"',
      );
      await expect(
        readFile(path.join(tempDir, "escape.json"), "utf8"),
      ).rejects.toThrow();
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
      const exitCode = await runCmxDocumentCli(["bundle"], {
        importModule: async () => {
          const error = new Error("missing") as Error & { code: string };
          error.code = "ERR_MODULE_NOT_FOUND";
          throw error;
        },
      });
      expect(exitCode).toBe(1);
      expect(stderr).toContain('Missing CLI dependency "@cmx-tools/cli"');
    } finally {
      process.stderr.write = stderrWrite;
    }
  });
});

function readPackageVersion(): string {
  const packageJsonPath = new URL("../package.json", import.meta.url);
  const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    version?: unknown;
  };
  if (typeof packageJson.version !== "string") {
    throw new Error("Missing package version");
  }
  return packageJson.version;
}
