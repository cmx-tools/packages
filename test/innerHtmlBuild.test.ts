import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { runCmxBundleCli } from "@cmx-tools/bundle/cli";
import { parseCmxBundleJson } from "@cmx-tools/contracts";
import { renderCmxDocuments } from "@cmx-tools/document";
import { createCmxUgcVerifier } from "@cmx-tools/verify";
import { createCmxTestbedWorkspace } from "./createCmxTestbedWorkspace.js";
import { renderCmxTestbed } from "./renderCmxTestbed.js";

it.each([undefined, false])(
  "rejects evaluated spread HTML when the build allowance is %s",
  async (dangerouslyAllowInnerHtml) => {
    const rendered = await renderCmxTestbed({
      dangerouslyAllowInnerHtml,
      files: {
        "entry.tsx": `export default async function Article() {
      const props = await Promise.resolve({innerHTML: "<strong>Editorial</strong>"});
      return <article {...props} />;
    }`,
      },
    });
    try {
      expect(rendered).toMatchObject({
        result: "error",
        bundle: { dangerouslyAllowInnerHtml: false },
        diagnostics: [
          {
            severity: "error",
            code: "inner-html-not-allowed",
            message: expect.stringContaining("dangerouslyAllowInnerHtml: true"),
          },
        ],
      });
    } finally {
      if ("rootDir" in rendered)
        await rm(rendered.rootDir, { recursive: true, force: true });
    }
  },
);

it("carries editorial HTML permission from build config through a parsed Bundle into Document Rendering", async () => {
  const workspace = await createCmxTestbedWorkspace();
  await workspace.writeSourceFiles({
    "package.json": '{"name":"editorial-content","type":"module"}',
    "entry.tsx": `export default async function Article() {
      const props = await Promise.resolve({innerHTML: "<strong>Editorial</strong>"});
      return <article {...props} />;
    }`,
    "cmx.config.ts": `export default {
      dangerouslyAllowInnerHtml: true,
      exports: {default: {required: true, type: {from: "@cmx-tools/contracts", import: "CmxNode"}}}
    };`,
  });
  try {
    expect(
      await runCmxBundleCli([
        "compile",
        "entry.tsx",
        "dist",
        "--cwd",
        workspace.rootDir,
      ]),
    ).toBe(0);
    const bundleDir = path.join(workspace.rootDir, "dist");
    const bundle = parseCmxBundleJson(
      await readFile(path.join(bundleDir, "cmx-bundle.json"), "utf8"),
    );
    expect(bundle).toMatchObject({ dangerouslyAllowInnerHtml: true });
    const rendered = await renderCmxDocuments({ bundleDir });
    expect(rendered).toMatchObject({
      result: "complete",
      entries: {
        entry: {
          document: {
            content: {
              default: {
                type: "element",
                tag: "article",
                props: { innerHTML: "<strong>Editorial</strong>" },
              },
            },
          },
        },
      },
    });
    if (rendered.result !== "complete")
      throw new Error("Editorial Document Rendering failed");
    const document = rendered.entries.entry.document;
    expect(JSON.stringify(document)).not.toContain("dangerouslyAllowInnerHtml");
    await expect(createCmxUgcVerifier()(document)).resolves.toMatchObject({
      valid: false,
      diagnostics: [
        {
          code: "ugc-disallowed-prop",
          message: expect.stringContaining("/props/innerHTML"),
        },
      ],
    });
    await expect(
      createCmxUgcVerifier({ dangerouslyAllowInnerHtml: true })(document),
    ).resolves.toEqual({ valid: true });
  } finally {
    await rm(workspace.rootDir, { recursive: true, force: true });
  }
});
