import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CmxDocument } from "cmx-contracts";
import { runCmxVerifyCli } from "./cmxVerifyCli.js";

const documentFixture: CmxDocument = {
  $schema: "https://cmx.xiphe.net/schemas/cmx-document.v1.schema.json",
  cmxVersion: 1,
  interface: { imports: {}, exports: {} },
  content: { default: { type: "element", tag: "main" } },
};

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-verify-cli-"));
  await run(tempDir);
}

async function runCli(
  cwd: string,
  args: readonly string[],
  options?: Parameters<typeof runCmxVerifyCli>[1],
) {
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
    const exitCode = await runCmxVerifyCli(args, options);
    return { exitCode, stdout, stderr };
  } finally {
    process.chdir(previousCwd);
    process.stdout.write = stdoutWrite;
    process.stderr.write = stderrWrite;
  }
}

describe("cmx-verify cli", () => {
  it("supports explicit validate verb with file input", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(
        path.join(tempDir, "doc.json"),
        `${JSON.stringify(documentFixture)}\n`,
        "utf8",
      );

      const result = await runCli(tempDir, ["validate", "doc.json"]);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(documentFixture);
      expect(result.stderr).toBe("");
    });
  });

  it("supports omitted validate verb", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(
        path.join(tempDir, "doc.json"),
        `${JSON.stringify(documentFixture)}\n`,
        "utf8",
      );

      const result = await runCli(tempDir, ["doc.json"]);
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(documentFixture);
    });
  });

  it("supports stdin single document", async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(tempDir, ["validate", "-"], {
        readStdin: async () => JSON.stringify(documentFixture),
      });
      expect(result.exitCode).toBe(0);
      expect(JSON.parse(result.stdout)).toEqual(documentFixture);
      expect(result.stderr).toBe("");
    });
  });

  it("supports entry map and fails when one document is invalid", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(
        path.join(tempDir, "cmx.config.ts"),
        [
          "import type { CmxConfig } from 'cmx-contracts';",
          "export default {",
          "  verifyDocument(document) {",
          "    if ('blocked' in document.content) {",
          "      return { valid: false, diagnostics: [{ severity: 'error', code: 'blocked', message: 'blocked export' }] };",
          "    }",
          "    return { valid: true };",
          "  },",
          "} satisfies CmxConfig;",
        ].join("\n"),
        "utf8",
      );

      await writeFile(
        path.join(tempDir, "docs.json"),
        `${JSON.stringify({ ok: documentFixture, bad: { ...documentFixture, content: { blocked: true } } })}\n`,
        "utf8",
      );

      const result = await runCli(tempDir, ["validate", "docs.json"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("blocked: blocked export");
    });
  });

  it("fails on invalid input shape", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(path.join(tempDir, "bad.json"), '{"foo":1}\n', "utf8");
      const result = await runCli(tempDir, ["validate", "bad.json"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("invalid-document-input");
    });
  });
});
