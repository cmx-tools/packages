import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { transpileModule } from "../src/transpile-module.js";

function createVirtualFs(files: Record<string, string>) {
  return {
    async readFile(filePath: string): Promise<string | undefined> {
      return files[filePath];
    }
  };
}

async function withTempDir(run: (dir: string) => Promise<void>): Promise<void> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "cmx-spike-"));
  await run(tempDir);
}

describe("transpileModule", () => {
  it("transpiles module graph from virtual filesystem", async () => {
    const entryFile = "/virtual/entry.tsx";
    const helperFile = "/virtual/helper.tsx";
    const fs = createVirtualFs({
      [entryFile]: [
        "import { Hero } from './helper';",
        "export const meta = { slug: 'virtual' };",
        "export default <main><Hero title='Hello VFS' /></main>;"
      ].join("\n"),
      [helperFile]: "export function Hero({ title }) { return <h1>{title}</h1>; }"
    });

    const result = await transpileModule({ entryFile, fs });

    expect(result.kind).toBe("success");
    if (result.kind !== "success") {
      throw new Error("expected successful result");
    }

    expect(result.meta).toEqual({ slug: "virtual" });
    expect(result.manifest).toEqual({ externals: [] });
    expect(result.tree).toEqual({
      kind: "element",
      tag: "main",
      children: [
        {
          kind: "element",
          tag: "h1",
          children: ["Hello VFS"]
        }
      ]
    });
  });

  it("returns diagnostics for missing virtual imports", async () => {
    const entryFile = "/virtual/entry.tsx";
    const fs = createVirtualFs({
      [entryFile]: [
        "import { Missing } from './missing';",
        "export default <main><Missing /></main>;"
      ].join("\n")
    });

    const result = await transpileModule({ entryFile, fs });

    expect(result.kind).toBe("error");
    if (result.kind !== "error") {
      throw new Error("expected error result");
    }

    expect(result.diagnostics.length).toBeGreaterThan(0);
    expect(result.diagnostics[0]?.message).toMatch(/Virtual module not found: \.\/missing/u);
  });

  it("converts TSX module to CMX-like tree", async () => {
    await withTempDir(async (tempDir) => {
      const helperFile = path.join(tempDir, "helper.tsx");
      const entryFile = path.join(tempDir, "entry.tsx");

      await writeFile(
        helperFile,
        ["export function Hero({ title }) {", "  return <h1>{title}</h1>;", "}"].join("\n"),
        "utf8"
      );

      await writeFile(
        entryFile,
        [
          "import { Hero } from './helper';",
          "export const meta = { slug: 'hello-world' };",
          "export default function Page() {",
          "  return <section><Hero title='Hello' /></section>;",
          "}"
        ].join("\n"),
        "utf8"
      );

      const result = await transpileModule({ entryFile });

      expect(result.kind).toBe("success");
      if (result.kind !== "success") {
        throw new Error("expected successful result");
      }

      expect(result.meta).toEqual({ slug: "hello-world" });
      expect(result.manifest).toEqual({ externals: [] });
      expect(result.tree).toEqual({
        kind: "element",
        tag: "section",
        children: [
          {
            kind: "element",
            tag: "h1",
            children: ["Hello"]
          }
        ]
      });
    });
  });

  it("returns diagnostics when default export missing", async () => {
    await withTempDir(async (tempDir) => {
      const entryFile = path.join(tempDir, "entry.tsx");
      await writeFile(entryFile, "export const value = 1;\n", "utf8");

      const result = await transpileModule({ entryFile });

      expect(result.kind).toBe("error");
      if (result.kind !== "error") {
        throw new Error("expected error result");
      }

      expect(result.diagnostics.length).toBeGreaterThan(0);
      expect(result.diagnostics[0]?.message).toMatch(/has no default export/u);
    });
  });

  it("returns stable success shape with diagnostics", async () => {
    const entryFile = "/virtual/entry.tsx";
    const fs = createVirtualFs({
      [entryFile]: "export default <article>ok</article>;"
    });

    const result = await transpileModule({ entryFile, fs });

    expect(result.kind).toBe("success");
    expect(result).toHaveProperty("diagnostics");
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result).toHaveProperty("tree");
    expect(result).toHaveProperty("manifest");
    if (result.kind !== "success") {
      throw new Error("expected successful result");
    }
    expect(result.manifest).toEqual({ externals: [] });
  });

  it("returns stable error shape with diagnostics only", async () => {
    const entryFile = "/virtual/entry.tsx";
    const fs = createVirtualFs({
      [entryFile]: "export default () => undefined;"
    });

    const result = await transpileModule({ entryFile, fs });

    expect(result.kind).toBe("error");
    expect(result).toHaveProperty("diagnostics");
    expect(Array.isArray(result.diagnostics)).toBe(true);
    expect(result.diagnostics).toMatchInlineSnapshot(`
      [
        {
          "message": "default export resolved to undefined",
        },
      ]
    `);
    expect(result).not.toHaveProperty("tree");
    expect(result).not.toHaveProperty("manifest");
    expect(result).not.toHaveProperty("meta");
  });
});
