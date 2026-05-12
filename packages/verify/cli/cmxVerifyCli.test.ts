import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { CmxDocument } from "@cmx-tools/contracts";
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
  it("documents only verify-owned flags in help output", async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(tempDir, ["--help"]);
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("--out-dir <dir>");
      expect(result.stdout).toContain("--cwd <path>");
      expect(result.stdout).toContain("--config <path>");
      expect(result.stdout).not.toContain("--external");
      expect(result.stdout).not.toContain("--exports");
      expect(result.stdout).not.toContain("--externals");
    });
  });

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
          "import type { CmxConfig } from '@cmx-tools/contracts';",
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

  it("fails with clear file location for invalid JSON", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(path.join(tempDir, "broken.json"), "{", "utf8");
      const result = await runCli(tempDir, ["validate", "broken.json"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Invalid JSON in broken.json");
    });
  });

  it("fails with clear stdin location for invalid JSON", async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(tempDir, ["validate", "-"], {
        readStdin: async () => "{",
      });
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Invalid JSON in stdin");
    });
  });

  it("writes single file input to --out-dir with input basename", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(
        path.join(tempDir, "about.json"),
        `${JSON.stringify(documentFixture)}\n`,
        "utf8",
      );

      const result = await runCli(tempDir, [
        "validate",
        "about.json",
        "--out-dir",
        "docs",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(
        JSON.parse(
          await readFile(path.join(tempDir, "docs", "about.json"), "utf8"),
        ),
      ).toEqual(documentFixture);
    });
  });

  it("writes one file per entry for entry map plus --out-dir", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(
        path.join(tempDir, "docs.json"),
        `${JSON.stringify({ home: documentFixture, about: documentFixture })}\n`,
        "utf8",
      );

      const result = await runCli(tempDir, [
        "validate",
        "docs.json",
        "--out-dir",
        "out",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(
        JSON.parse(
          await readFile(path.join(tempDir, "out", "home.json"), "utf8"),
        ),
      ).toEqual(documentFixture);
      expect(
        JSON.parse(
          await readFile(path.join(tempDir, "out", "about.json"), "utf8"),
        ),
      ).toEqual(documentFixture);
    });
  });

  it("fails stdin single document with --out-dir", async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(
        tempDir,
        ["validate", "-", "--out-dir", "docs"],
        {
          readStdin: async () => JSON.stringify(documentFixture),
        },
      );

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("stdin");
      expect(result.stderr).toContain("--out-dir");
    });
  });

  it("keeps --out-dir entry-map writes all-or-nothing", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(
        path.join(tempDir, "cmx.config.ts"),
        [
          "import type { CmxConfig } from '@cmx-tools/contracts';",
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

      const result = await runCli(tempDir, [
        "validate",
        "docs.json",
        "--out-dir",
        "safe-docs",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("blocked: blocked export");
      await expect(
        readFile(path.join(tempDir, "safe-docs", "ok.json"), "utf8"),
      ).rejects.toThrow();
      await expect(
        readFile(path.join(tempDir, "safe-docs", "bad.json"), "utf8"),
      ).rejects.toThrow();
    });
  });

  it("supports stdin entry map with --out-dir", async () => {
    await withTempDir(async (tempDir) => {
      const result = await runCli(
        tempDir,
        ["validate", "-", "--out-dir", "docs"],
        {
          readStdin: async () =>
            JSON.stringify({
              home: documentFixture,
              about: documentFixture,
            }),
        },
      );

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
      expect(result.stderr).toBe("");
      expect(
        JSON.parse(
          await readFile(path.join(tempDir, "docs", "home.json"), "utf8"),
        ),
      ).toEqual(documentFixture);
      expect(
        JSON.parse(
          await readFile(path.join(tempDir, "docs", "about.json"), "utf8"),
        ),
      ).toEqual(documentFixture);
    });
  });

  it("uses config-composed visitors to reject unsafe documents", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(
        path.join(tempDir, "cmx.config.ts"),
        [
          "import type { CmxConfig } from '@cmx-tools/contracts';",
          "const disallowDangerouslySetInnerHtml = (node) => {",
          "  if (!node || typeof node !== 'object' || !('type' in node)) return [];",
          "  if (!('props' in node)) return [];",
          "  return node.props && 'dangerouslySetInnerHTML' in node.props",
          "    ? [{ severity: 'error', code: 'no-dangerous-html', message: 'dangerouslySetInnerHTML blocked' }]",
          "    : [];",
          "};",
          "const disallowScriptTags = (node) => {",
          "  if (!node || typeof node !== 'object' || !('type' in node)) return [];",
          "  return node.type === 'element' && node.tag === 'script'",
          "    ? [{ severity: 'error', code: 'no-script-tag', message: 'script tag blocked' }]",
          "    : [];",
          "};",
          "const visitors = [",
          "  disallowDangerouslySetInnerHtml,",
          "  disallowScriptTags,",
          "];",
          "const verifyDocument = (document) => {",
          "  const diagnostics = [];",
          "  const visit = (node) => {",
          "    for (const visitor of visitors) diagnostics.push(...visitor(node));",
          "    if (!node || typeof node !== 'object' || !('type' in node)) return;",
          "    for (const child of node.children ?? []) visit(child);",
          "  };",
          "  for (const value of Object.values(document.content)) visit(value);",
          "  return diagnostics.length === 0 ? { valid: true } : { valid: false, diagnostics };",
          "};",
          "export default {",
          "  verifyDocument,",
          "} satisfies CmxConfig;",
        ].join("\n"),
        "utf8",
      );
      await writeFile(
        path.join(tempDir, "docs.json"),
        `${JSON.stringify({
          home: {
            ...documentFixture,
            content: {
              default: {
                type: "element",
                tag: "script",
                props: { dangerouslySetInnerHTML: { __html: "<x/>" } },
              },
            },
          },
        })}\n`,
        "utf8",
      );

      const result = await runCli(tempDir, ["validate", "docs.json"]);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("no-dangerous-html");
      expect(result.stderr).toContain("no-script-tag");
    });
  });

  it("does not treat non-verify flags as native value flags", async () => {
    await withTempDir(async (tempDir) => {
      await writeFile(
        path.join(tempDir, "doc.json"),
        `${JSON.stringify(documentFixture)}\n`,
        "utf8",
      );

      const result = await runCli(tempDir, [
        "--external",
        "@theme/ui",
        "doc.json",
      ]);

      expect(result.exitCode).toBe(1);
      expect(result.stdout).toBe("");
      expect(result.stderr).toContain("Usage:");
    });
  });
});
