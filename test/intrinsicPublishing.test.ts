import { spawnSync } from "node:child_process";
import { rm } from "node:fs/promises";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import type { CmxNode } from "@cmx-tools/contracts";
import { cmx } from "@cmx-tools/react";
import {
  assertCmxDocument,
  assertCmxUgc,
  CmxUgcError,
} from "@cmx-tools/verify";
import { renderCmxTestbed } from "./renderCmxTestbed.js";

it("publishes bare CMX articles with an explicit choice between reader UGC and trusted editorial content", async () => {
  const rendered = await renderCmxTestbed({
    entries: ["reader.tsx", "editor.tsx"],
    files: {
      "authoring.tsconfig.json": JSON.stringify({
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          jsx: "react-jsx",
          jsxImportSource: "@cmx-tools/intrinsics",
          strict: true,
          noEmit: true,
          types: [],
          lib: ["ES2022"],
        },
        include: ["*.tsx"],
      }),
      "reader.tsx": `
        export default (
          <article tabindex={0}>
            <h1>Fresh coffee</h1>
            <p>Meet the <a href="https://example.com/growers">growers</a>.</p>
          </article>
        );
      `,
      "editor.tsx": `
        export default (
          <article class="editor-pick" style="color: brown; --accent: #630">
            <h1>Fresh coffee</h1>
            <p innerHTML="Meet the <strong>growers</strong>." />
          </article>
        );
      `,
    },
  });
  expect(rendered.result).toBe("complete");
  if (rendered.result !== "complete") {
    throw new Error("Article Document Rendering failed");
  }

  try {
    const compilation = spawnSync(
      "corepack",
      [
        "pnpm",
        "exec",
        "tsgo",
        "-p",
        path.join(rendered.rootDir, "authoring.tsconfig.json"),
      ],
      { encoding: "utf8", timeout: 30_000 },
    );
    expect(
      compilation.status,
      compilation.error?.message ?? compilation.stdout + compilation.stderr,
    ).toBe(0);

    const reader: unknown = JSON.parse(
      JSON.stringify(rendered.entries.reader.document),
    );
    assertCmxDocument(reader);
    await assertCmxUgc(reader);

    expect(
      renderToStaticMarkup(cmx<{ default: CmxNode }>(reader).default),
    ).toBe(
      '<article tabindex="0"><h1>Fresh coffee</h1><p>Meet the <a href="https://example.com/growers">growers</a>.</p></article>',
    );

    const editor: unknown = JSON.parse(
      JSON.stringify(rendered.entries.editor.document),
    );
    assertCmxDocument(editor);

    const rejection = await assertCmxUgc(editor).catch(
      (error: unknown) => error,
    );
    expect(rejection).toBeInstanceOf(CmxUgcError);
    expect(rejection).toMatchObject({
      diagnostics: [
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/class"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/style"),
        },
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/innerHTML"),
        },
      ],
    });

    expect(
      renderToStaticMarkup(cmx<{ default: CmxNode }>(editor).default),
    ).toBe(
      '<article class="editor-pick" style="color:brown;--accent:#630"><h1>Fresh coffee</h1><p>Meet the <strong>growers</strong>.</p></article>',
    );
  } finally {
    await rm(rendered.rootDir, { recursive: true, force: true });
  }
});
